from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.career import Career, CareerMatch
from app.models.roadmap import RoadmapItem
from app.models.user import User
from app.llm import prompts
from app.schemas.career import CareerMatchRequest
from app.services.career_dna import get_dna, get_or_create_dna
from app.services.providers import dna_dict, gemini, memory


def search_careers(db: Session, q: str | None = None, category: str | None = None, limit: int = 50) -> list[Career]:
    stmt = select(Career)
    if category:
        stmt = stmt.where(Career.category == category)
    if q:
        needle = f"%{q.lower()}%"
        stmt = stmt.where(
            Career.title.ilike(needle)
            | Career.category.ilike(needle)
            | Career.summary.ilike(needle)
        )
    return list(db.scalars(stmt.order_by(Career.title).limit(limit)))


def get_career(db: Session, career_id: int | None = None, slug: str | None = None) -> Career | None:
    if slug:
        return db.scalar(select(Career).where(Career.slug == slug))
    if career_id:
        return db.get(Career, career_id)
    return None


def career_detail(db: Session, career: Career, user: User | None = None) -> dict:
    data = {
        "id": career.id,
        "slug": career.slug,
        "title": career.title,
        "category": career.category,
        "emoji": career.emoji,
        "summary": career.summary,
        "description": career.description,
        "what_they_do": career.what_they_do,
        "skills": career.skills or [],
        "subjects": career.subjects or [],
        "degrees": career.degrees or [],
        "industries": career.industries or [],
        "future_paths": career.future_paths or [],
        "salary_range": career.salary_range,
        "outlook": career.outlook,
        "fit_rating": None,
        "reasons": None,
    }
    if user:
        match = db.scalar(
            select(CareerMatch).where(
                CareerMatch.user_id == user.id, CareerMatch.career_id == career.id
            )
        )
        if match:
            data["fit_rating"] = round(match.score)
            data["reasons"] = match.reasons or []
    return data


def list_career_matches(db: Session, user: User) -> list[CareerMatch]:
    stmt = (
        select(CareerMatch)
        .where(CareerMatch.user_id == user.id)
        .order_by(CareerMatch.score.desc())
    )
    return list(db.scalars(stmt))


async def match_careers(db: Session, user: User, request: CareerMatchRequest) -> list[CareerMatch]:
    dna = get_or_create_dna(user, db)
    catalog = [
        {
            "slug": c.slug,
            "title": c.title,
            "category": c.category,
            "summary": c.summary[:220],
            "skills": c.skills or [],
            "subjects": c.subjects or [],
            "industries": c.industries or [],
        }
        for c in search_careers(db, limit=100)
    ]
    if not catalog:
        return []

    matches = None
    try:
        result = await gemini.complete_json(
            prompts.career_match_prompt(catalog, dna_dict(dna), request.focus),
            system=prompts.CAREER_MATCH_SYSTEM,
        )
        if isinstance(result, dict) and isinstance(result.get("matches"), list):
            matches = result["matches"]
    except Exception as exc:
        print(f"[careers] LLM match failed, using heuristic fallback: {exc}")

    validated = _validate_matches(db, matches, catalog) if matches else _heuristic_matches(db, user, catalog)

    for old in list_career_matches(db, user):
        db.delete(old)
    db.commit()

    stored: list[CareerMatch] = []
    for rank, m in enumerate(validated[: request.limit], start=1):
        career = db.scalar(select(Career).where(Career.slug == m["slug"]))
        if not career:
            continue
        cm = CareerMatch(
            user_id=user.id,
            career_id=career.id,
            score=float(m["score"]),
            rank=rank,
            reasons=m.get("reasons") or [],
        )
        db.add(cm)
        stored.append(cm)
    db.commit()
    for cm in stored:
        db.refresh(cm)
    if stored:
        memory.archive(
            user,
            f"User discovered a strong career match: {stored[0].career.title} "
            f"(fit {round(stored[0].score)}%).",
            ("career", "match"),
        )
    return stored


def _validate_matches(db: Session, matches: list[dict], catalog: list[dict]) -> list[dict]:
    valid_slugs = {c["slug"] for c in catalog}
    cleaned = []
    for m in matches:
        slug = (m or {}).get("slug", "")
        try:
            score = float(m.get("score", 0))
        except (TypeError, ValueError):
            score = 0
        if slug in valid_slugs and score >= 55:
            reasons = m.get("reasons") or []
            if not isinstance(reasons, list):
                reasons = []
            cleaned.append({"slug": slug, "score": score, "reasons": [str(r) for r in reasons]})
    cleaned.sort(key=lambda x: x["score"], reverse=True)
    return cleaned


def _heuristic_matches(db: Session, user: User, catalog: list[dict]) -> list[dict]:
    """Deterministic fallback: score by keyword overlap with the student's DNA."""
    dna = get_dna(user, db)
    buckets = {
        "interests": dna.interests or [],
        "skills": dna.skills or [],
        "career_zones": dna.career_zones or [],
        "subjects": dna.subjects or [],
    } if dna else {}

    interest_tokens = set()
    for item in buckets.values():
        for entry in item:
            interest_tokens.update(str(entry).lower().split())

    scored = []
    for c in catalog:
        blob = " ".join(
            [c["title"], c["category"], c["summary"]]
            + (c.get("skills") or [])
            + (c.get("subjects") or [])
            + (c.get("industries") or [])
        ).lower()
        blob_tokens = set(blob.split())
        overlap = blob_tokens & interest_tokens
        score = min(95, 40 + len(overlap) * 12)
        reasons = [f"You seem drawn to things related to {list(overlap)[0]}" ] if overlap else []
        scored.append({"slug": c["slug"], "score": score, "reasons": reasons})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return [s for s in scored if s["score"] >= 50][:10]


# ---------------------------------------------------------------------------
# Career advice (detail page)
# ---------------------------------------------------------------------------

ADVICE_TYPES = {"project", "skill", "explore"}
ADVICE_LINKS = {"passport", "careers", "universities", "roadmap"}

_advice_cache: dict[tuple[int, int], dict] = {}


async def career_advice(db: Session, user: User, career: Career) -> dict:
    """Personalized 'why this fits you' + concrete next steps for a career."""
    key = (user.id, career.id)
    if key in _advice_cache:
        return dict(_advice_cache[key])

    from app.services import passport as passport_svc

    dna = get_dna(user, db)
    student = {"name": user.display_name, "grade": user.grade, "school": user.school}
    grade = user.grade or 9

    roadmap_items = [
        {
            "grade": i.grade,
            "stage": i.stage.value,
            "title": i.title,
            "description": i.description,
            "category": i.category,
        }
        for i in db.scalars(
            select(RoadmapItem)
            .where(RoadmapItem.user_id == user.id, RoadmapItem.completed.is_(False), RoadmapItem.grade >= grade)
            .order_by(RoadmapItem.grade, RoadmapItem.order_index)
            .limit(8)
        )
    ]
    passport_counts = {
        c: sum(1 for it in passport_svc.list_items(db, user) if it.category == c)
        for c in passport_svc.CORE_CATEGORIES
    }

    fit_statement, next_steps = None, None
    try:
        result = await gemini.complete_json(
            prompts.career_advice_prompt(
                {
                    "slug": career.slug, "title": career.title, "category": career.category,
                    "summary": career.summary, "skills": career.skills or [],
                    "subjects": career.subjects or [], "industries": career.industries or [],
                },
                dna_dict(dna), student, roadmap_items, passport_counts,
            ),
            system=prompts.CAREER_ADVICE_SYSTEM,
        )
        if isinstance(result, dict):
            fit_statement = str(result.get("fit_statement") or "").strip() or None
            next_steps = _clean_steps(result.get("next_steps"))
    except Exception as exc:
        print(f"[careers] advice LLM failed, using heuristic: {exc}")

    if not next_steps or not fit_statement:
        hfit, hsteps = _heuristic_advice(career, dna, roadmap_items)
        next_steps = next_steps or hsteps
        fit_statement = fit_statement or hfit

    match = db.scalar(
        select(CareerMatch).where(
            CareerMatch.user_id == user.id, CareerMatch.career_id == career.id
        )
    )
    result = {
        "career_slug": career.slug,
        "fit_rating": round(match.score) if match else None,
        "reasons": (match.reasons or []) if match else None,
        "fit_statement": fit_statement,
        "next_steps": next_steps[:3],
    }
    _advice_cache[key] = result
    return dict(result)


def _clean_steps(value) -> list[dict]:
    if not isinstance(value, list):
        return []
    out = []
    for s in value:
        if not isinstance(s, dict):
            continue
        step_type = str(s.get("type") or "").strip()
        title = str(s.get("title") or "").strip()
        why = str(s.get("why") or "").strip()
        link = str(s.get("link") or "").strip()
        if step_type not in ADVICE_TYPES or link not in ADVICE_LINKS or not title or not why:
            continue
        out.append({"type": step_type, "title": title, "why": why, "link": link})
    return out[:3]


def _heuristic_advice(career: Career, dna, roadmap_items: list[dict]) -> tuple[str, list[dict]]:
    d = dna_dict(dna)
    interests = (d.get("interests") or [])[:2]
    strengths = (d.get("strengths") or [])[:2]
    if interests and strengths:
        fit = (
            f"With your interest in {interests[0]} and your strength in {strengths[0]}, "
            f"{career.title} could be a natural place to put what you're good at to work. "
            "It asks for real effort, but it's the kind of path you can grow into."
        )
    elif interests:
        fit = (
            f"I've noticed you gravitate toward {interests[0]}. {career.title} blends that "
            "with real-world problems — worth exploring before you decide."
        )
    else:
        fit = (
            f"{career.title} isn't about having the world figured out. It's about combining "
            "curiosity and consistent practice — let's figure out if it fits you."
        )

    if roadmap_items:
        steps = [
            {
                "type": "explore",
                "title": f"Next on your roadmap: {it['title']}",
                "why": "It's already a step on your plan toward your goal.",
                "link": "roadmap",
            }
            for it in roadmap_items[:3]
        ]
    else:
        steps = [
            {
                "type": "project",
                "title": f"Build a small {career.title.lower()} project",
                "why": "The fastest way to test whether a path fits is to try doing it.",
                "link": "passport",
            },
            {
                "type": "skill",
                "title": f"Learn {(career.skills or ['a core skill'])[0]}",
                "why": "This is one of the core skills this career rewards.",
                "link": "roadmap",
            },
            {
                "type": "explore",
                "title": "Explore university programs in this field",
                "why": "See where this career can take you after school.",
                "link": "universities",
            },
        ]
    return fit, steps