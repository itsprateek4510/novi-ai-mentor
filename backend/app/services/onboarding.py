from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.roadmap import RoadmapItem
from app.models.user import User
from app.services import checkins as checkins_svc
from app.services import passport as passport_svc
from app.services import roadmap as roadmap_svc
from app.services import universities as uni_svc
from app.services.career_dna import get_or_create_dna
from app.services.careers import list_career_matches

STEPS = (
    ("profile", "Complete your profile", "Add your name, grade and school so Novi gives age-appropriate advice.", "profile"),
    ("dna", "Build your Career DNA", "Chat with Novi, or fill in what you're interested in and good at.", "dna"),
    ("match", "Discover your careers", "Run an AI career match to find fields that actually fit you.", "careers"),
    ("goal", "Set a goal", "Say where you want to go — a career track or a dream university.", "roadmap"),
    ("roadmap", "Generate your roadmap", "Turn your goal into a concrete grade-by-grade plan.", "roadmap"),
    ("passport", "Start your Career Passport", "Record your first project, competition or win.", "passport"),
    ("university", "Check university readiness", "Explore universities and see how ready you are.", "universities"),
    ("checkin", "Finish a weekly check-in", "Answer your first weekly check-in so Novi stays sharp.", "checkin"),
)


def onboarding(db: Session, user: User) -> dict:
    dna = get_or_create_dna(user, db)
    flags = {
        "profile": bool(user.first_name and user.school and user.grade),
        "dna": bool(dna.dna_filled),
        "match": bool(list_career_matches(db, user)),
        "goal": bool(roadmap_svc.list_goals(db, user)),
        "roadmap": db.scalar(
            select(RoadmapItem.id).where(RoadmapItem.user_id == user.id).limit(1)
        ) is not None,
        "passport": bool(passport_svc.list_items(db, user)),
        "university": bool(uni_svc.recent_matches(db, user)),
        "checkin": bool(checkins_svc.list_checkins(db, user, limit=1)),
    }

    steps = [
        {"key": key, "label": label, "detail": detail, "route": route, "done": bool(flags[key])}
        for key, label, detail, route in STEPS
    ]
    done = sum(1 for s in steps if s["done"])
    next_action = next(((s) for s in steps if not s["done"]), None)

    return {
        "steps": steps,
        "total": len(steps),
        "done": done,
        "percent": round(done / len(steps) * 100),
        "next_action": next_action,
    }