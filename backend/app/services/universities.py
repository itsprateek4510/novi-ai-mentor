import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.university import University, UniversityMatch
from app.models.user import User
from app.llm import prompts
from app.schemas.university import ReadinessRequest, UniversityFilters
from app.services.career_dna import get_dna
from app.services.providers import dna_dict, gemini, memory


def search_universities(db: Session, filters: UniversityFilters) -> list[University]:
    stmt = select(University)
    if filters.q:
        needle = f"%{filters.q.lower()}%"
        stmt = stmt.where(
            University.name.ilike(needle)
            | University.course.ilike(needle)
            | University.country.ilike(needle)
            | University.about.ilike(needle)
        )
    if filters.country:
        stmt = stmt.where(University.country == filters.country)
    if filters.subject:
        stmt = stmt.where(University.subject == filters.subject)
    if filters.university_type:
        stmt = stmt.where(University.university_type == filters.university_type)
    if filters.min_rank:
        stmt = stmt.where(University.ranking <= filters.min_rank)
    if filters.max_fees is not None:
        stmt = stmt.where(University.fees_per_year <= filters.max_fees)
    if filters.scholarships is not None:
        stmt = stmt.where(University.scholarships == filters.scholarships)
    stmt = stmt.order_by(University.ranking.asc()).limit(filters.limit)
    return list(db.scalars(stmt))


def get_university(db: Session, university_id: int | None = None, slug: str | None = None) -> University | None:
    if slug:
        return db.scalar(select(University).where(University.slug == slug))
    if university_id:
        return db.get(University, university_id)
    return None


def list_countries(db: Session) -> list[str]:
    rows = db.scalars(select(University.country).distinct().order_by(University.country))
    return [r for r in rows if r]


def list_subjects(db: Session) -> list[str]:
    rows = db.scalars(select(University.subject).distinct().order_by(University.subject))
    return [r for r in rows if r]


async def readiness(db: Session, user: User, request: ReadinessRequest) -> UniversityMatch:
    university = db.get(University, request.university_id)
    if not university:
        raise ValueError("University not found")

    dna = get_dna(user, db)
    profile = _profile_summary(db, user)

    assessment = None
    try:
        result = await gemini.complete_json(
            prompts.university_readiness_prompt(
                {
                    "name": university.name,
                    "rank": university.ranking,
                    "fees": university.fees_per_year,
                    "type": university.university_type,
                    "course": request.course or university.course,
                    "entry_requirements": university.entry_requirements,
                    "strengths": university.strengths or [],
                    "about": university.about,
                },
                dna_dict(dna),
                profile,
                {"name": user.display_name, "grade": user.grade, "school": user.school},
            ),
            system=prompts.UNIVERSITY_READINESS_SYSTEM,
        )
        if isinstance(result, dict):
            assessment = result
    except Exception as exc:
        print(f"[universities] readiness LLM failed, using heuristic: {exc}")

    if assessment is None:
        assessment = _heuristic_readiness(user, university, dna)

    existing = db.scalar(
        select(UniversityMatch).where(
            UniversityMatch.user_id == user.id,
            UniversityMatch.university_id == university.id,
        )
    )
    if existing is None:
        existing = UniversityMatch(user_id=user.id, university_id=university.id)
        db.add(existing)
    existing.course = request.course or university.course
    existing.readiness = max(0, min(100, float(assessment.get("readiness", 50))))
    existing.strengths = assessment.get("strengths") or []
    existing.improvements = assessment.get("improvements") or []
    existing.next_steps = assessment.get("next_steps") or []
    db.commit()
    db.refresh(existing)
    memory.archive(
        user,
        f"User checked university readiness for {university.name} "
        f"({existing.course}): {existing.readiness}%.",
        ("university", "readiness"),
    )
    return existing


def recent_matches(db: Session, user: User) -> list[UniversityMatch]:
    stmt = (
        select(UniversityMatch)
        .where(UniversityMatch.user_id == user.id)
        .order_by(UniversityMatch.readiness.desc())
    )
    return list(db.scalars(stmt))


def recommend(db: Session, user: User, limit: int = 6) -> list[dict]:
    """DNA-grounded university recommendations — rank programs by how well they align
    with the student's career zones, interests, subjects and goals. Deterministic and
    fast (no LLM). Falls back to recent readiness checks when the DNA is not filled."""
    dna = get_dna(user, db)
    buckets: dict[str, list[str]] = {
        "career_zones": (dna.career_zones or []) if dna else [],
        "interests": (dna.interests or []) if dna else [],
        "subjects": (dna.subjects or []) if dna else [],
        "goals": (dna.goals or []) if dna else [],
        "skills": (dna.skills or []) if dna else [],
    }
    weights = {"career_zones": 4, "goals": 3, "interests": 3, "subjects": 2, "skills": 1}
    phrases = [p for arr in buckets.values() for p in arr if p and len(p.strip()) > 1]
    if not phrases:
        return recent_matches(db, user)

    catalog = list(db.scalars(select(University).order_by(University.ranking.asc()).limit(80)))
    scored: list[dict] = []
    for uni in catalog:
        hay = " ".join(
            [uni.course or "", uni.subject or "", " ".join(uni.strengths or []), uni.about or ""]
        ).lower()
        alignment = 0
        best_field, best_phrase = None, None
        for field, arr in buckets.items():
            for phrase in arr:
                p = phrase.lower()
                if p in hay:
                    alignment += weights[field]
                    if best_field is None or weights[field] > weights.get(best_field, 0):
                        best_field, best_phrase = field, phrase
        if alignment == 0:
            continue
        readiness = _heuristic_readiness(user, uni, dna)["readiness"]
        readiness = min(98, readiness + min(18, alignment * 2))
        reason = _reason(best_field, best_phrase)
        scored.append(
            {
                "id": uni.id,
                "readiness": readiness,
                "strengths": [uni.subject or "Subject strength", "Relevant coursework"],
                "improvements": ["Research depth", "Extracurricular profile"],
                "next_steps": [
                    f"Build a project or case study related to {best_phrase or uni.subject}",
                    "Strengthen grades in your core subjects",
                    "Explore scholarship and application timelines",
                ],
                "university": uni,
                "reason": reason,
            }
        )
    scored.sort(key=lambda m: m["readiness"], reverse=True)
    return scored[:limit]


def _reason(field: str | None, phrase: str | None) -> str:
    labels = {
        "career_zones": "a top career zone in your DNA",
        "goals": "one of your stated career goals",
        "interests": "an area you're actively interested in",
        "subjects": "one of your favourite subjects",
        "skills": "a skill you're building",
    }
    if field and phrase:
        return f"Coursework aligned with {phrase.lower()} — {labels.get(field, 'your profile')}."
    return "Program broadly aligned with your profile."


def average_readiness(db: Session, user: User) -> int:
    matches = recent_matches(db, user)
    if not matches:
        return 0
    return round(sum(m.readiness for m in matches) / len(matches))


def _profile_summary(db: Session, user: User) -> dict:
    from app.models.checkin import WeeklyCheckin
    from app.models.passport import PassportItem
    from app.models.roadmap import Goal, RoadmapItem

    goals = list(db.scalars(select(Goal).where(Goal.user_id == user.id, Goal.status == "active")))
    passport = list(db.scalars(select(PassportItem).where(PassportItem.user_id == user.id)))
    roadmap = list(db.scalars(select(RoadmapItem).where(RoadmapItem.user_id == user.id)))
    checkins = list(
        db.scalars(
            select(WeeklyCheckin)
            .where(WeeklyCheckin.user_id == user.id)
            .order_by(WeeklyCheckin.week_start.desc())
            .limit(3)
        )
    )
    return {
        "grade": user.grade,
        "school": user.school,
        "goals": [{"title": g.title, "category": g.category.value} for g in goals],
        "passport": [{"category": p.category.value, "title": p.title} for p in passport],
        "roadmap_completed": sum(1 for r in roadmap if r.completed),
        "roadmap_total": len(roadmap),
        "recent_checkins": [
            {"accomplishments": c.accomplishments, "learnings": c.learnings} for c in checkins
        ],
    }


def _heuristic_readiness(user: User, university: University, dna) -> dict:
    grade = user.grade or 9
    base = grade * 5  # 45 -> 60
    alignment = 0
    if dna and (dna.interests or dna.subjects):
        blob = " ".join((dna.interests or []) + (dna.subjects or [])).lower()
        if university.subject.lower() in blob:
            alignment = 15
        elif any(t.lower() in university.about.lower() for t in (dna.interests or [])):
            alignment = 10
    rank_bonus = 10 if (university.ranking or 500) <= 50 else 0
    readiness = min(95, base + alignment + rank_bonus)
    return {
        "readiness": readiness,
        "strengths": ["Academic performance", university.subject or "Subject interest"],
        "improvements": ["Research depth", "Leadership", "Extracurricular profile"],
        "next_steps": [
            "Strengthen your grades in key subjects",
            f"Explore a project related to {university.subject or 'your subject of interest'}",
            "Join an activity that shows leadership or initiative",
        ],
    }