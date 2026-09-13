from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.roadmap import RoadmapItem
from app.models.user import ParentStudentLink, User, UserRole
from app.llm import prompts
from app.schemas.dashboard import ParentChildSummary
from app.services import roadmap as roadmap_svc
from app.services import universities as uni_svc
from app.services.career_dna import get_dna
from app.services.dashboard import progress_indicators
from app.services.providers import fallback_insight, gemini


def link_student(db: Session, parent: User, student_email: str) -> User:
    student = db.scalar(select(User).where(User.email == student_email.lower()))
    if not student:
        raise HTTPException(status_code=404, detail="No student found with that email")
    if student.role != UserRole.STUDENT:
        raise HTTPException(status_code=400, detail="That account is not a student")
    existing = db.scalar(
        select(ParentStudentLink).where(
            ParentStudentLink.parent_id == parent.id,
            ParentStudentLink.student_id == student.id,
        )
    )
    if not existing:
        db.add(ParentStudentLink(parent_id=parent.id, student_id=student.id))
        db.commit()
    return student


def linked_students(db: Session, parent: User) -> list[User]:
    rows = db.scalars(
        select(User)
        .join(ParentStudentLink, ParentStudentLink.student_id == User.id)
        .where(ParentStudentLink.parent_id == parent.id)
    )
    return list(rows)


def child_summary(db: Session, child: User) -> dict:
    dna = get_dna(child, db)
    progress = progress_indicators(db, child)
    matches = uni_svc.recent_matches(db, child)
    improvements = []
    if matches:
        improvements = matches[0].improvements or []
    if not improvements:
        grade_items = [
            i.title for i in db.scalars(
                select(RoadmapItem).where(
                    RoadmapItem.user_id == child.id,
                    RoadmapItem.completed.is_(False),
                    RoadmapItem.grade >= (child.grade or 9),
                )
            )
        ][:3]
        improvements = grade_items

    career = None
    from app.services.careers import list_career_matches

    cm = list_career_matches(db, child)
    if cm:
        career = cm[0].career.title

    insight = fallback_insight(
        child.first_name or "your child", child.grade,
        {"interests": (dna.interests or []) if dna else [], "career_zones": (dna.career_zones or []) if dna else []},
        career,
    )
    return ParentChildSummary(
        name=child.display_name,
        grade=child.grade,
        career_direction=progress["career_direction"],
        profile_strength=progress["profile_strength"],
        university_readiness=progress["university_readiness"],
        month_focus=improvements,
        insight=insight,
    ).model_dump()


def parent_dashboard(db: Session, parent: User) -> dict:
    children = linked_students(db, parent)
    summaries = [child_summary(db, c) for c in children]
    insight = (
        f"{summaries[0]['name']} is {summaries[0]['career_direction'].lower()} on their journey. "
        f"Profile strength is {summaries[0]['profile_strength']}% — keep encouraging real-world experiences over certificates."
        if summaries
        else "Link a student to start following their journey."
    )
    return {"children": summaries, "insight": insight}


async def advisor(db: Session, parent: User, question: str, child_id: int | None) -> str:
    children = linked_students(db, parent)
    child = None
    if child_id:
        child = next((c for c in children if c.id == child_id), None)
    elif children:
        child = children[0]

    if not child:
        return "Link a student to your account first so I can answer with context."

    child_context = {
        "name": child.display_name,
        "grade": child.grade,
        "school": child.school,
        "progress_summary": progress_indicators(db, child),
        "top_career": None,
    }
    try:
        from app.services.careers import list_career_matches

        cm = list_career_matches(db, child)
        if cm:
            child_context["top_career"] = cm[0].career.title
            child_context["career_fit"] = round(cm[0].score)
    except Exception as exc:
        print(f"[parents] career context skipped: {exc}")

    try:
        answer = await gemini.complete(
            prompts.parent_advisor_prompt(question, child_context),
            system=prompts.PARENT_ADVISOR_SYSTEM,
        )
        return answer
    except Exception as exc:
        print(f"[parents] advisor failed: {exc}")
        return (
            f"Here's what I can tell you about {child.first_name}: they're currently "
            f"{child_context['progress_summary']['career_direction'].lower()} on their journey "
            f"with a profile strength of {child_context['progress_summary']['profile_strength']}%. "
            "The best thing to do right now is keep encouraging exploration and real projects."
        )