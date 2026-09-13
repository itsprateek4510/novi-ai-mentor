import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.career_dna import CareerDNA
from app.models.user import User
from app.llm import prompts
from app.schemas.career_dna import CareerDNAUpdate, ReflectionUpdate
from app.services.providers import dna_dict, gemini, memory

_NEGATION_RE = re.compile(
    r"\b(?:don'?t like|do not like|not a fan of|not interested in|lost interest in|"
    r"bored of|getting bored of|no longer (?:into|care about)|isn'?t for me|is not for me|"
    r"not into|don'?t care about|don'?t enjoy|hate|can'?t stand|cannot stand|dislike)\b",
    re.I,
)
_PREFER_OVER_RE = re.compile(
    r"\bprefer(?:s|red)?\b[^.]*?\bover\s+([a-z][a-z0-9 &+-]*)", re.I
)
_STOPWORDS = {
    "the", "and", "part", "parts", "when", "that", "with", "this", "too",
    "much", "now", "more", "anymore", "it", "is", "of", "to", "for",
    "on", "in", "my", "me", "i", "a", "an", "stuff", "thing", "things",
}

PREFERENCE_FIELDS = ("interests", "subjects", "skills", "career_zones", "goals", "motivations", "values")


def get_dna(user: User, db: Session) -> CareerDNA | None:
    return db.scalar(select(CareerDNA).where(CareerDNA.user_id == user.id))


def get_or_create_dna(user: User, db: Session) -> CareerDNA:
    dna = get_dna(user, db)
    if dna:
        return dna
    dna = CareerDNA(user_id=user.id)
    db.add(dna)
    db.commit()
    db.refresh(dna)
    return dna


def apply_dna_fields(dna: CareerDNA, data: CareerDNAUpdate) -> None:
    for field in (
        "traits", "motivations", "strengths", "development_areas", "interests",
        "subjects", "skills", "career_zones", "values", "goals", "novi_reflection",
    ):
        value = getattr(data, field)
        if value is not None:
            setattr(dna, field, value)
    if data.dna_filled is not None:
        dna.dna_filled = data.dna_filled
    if not dna.dna_filled and any(
        getattr(dna, f) for f in ("traits", "interests", "strengths", "career_zones")
    ):
        dna.dna_filled = True


def update_dna(user: User, data: CareerDNAUpdate, db: Session) -> CareerDNA:
    dna = get_or_create_dna(user, db)
    apply_dna_fields(dna, data)
    db.commit()
    db.refresh(dna)
    _mirror_dna_to_memory(user, dna)
    return dna


def _mirror_dna_to_memory(user: User, dna: CareerDNA) -> None:
    """Keep Letta's live profile + archival snapshot in sync with Career DNA."""
    if not dna.dna_filled:
        return
    interests = dna.interests or []
    skills = dna.skills or []
    goals = dna.goals or []
    memory.sync_profile(
        user, user.display_name, user.grade, user.school or None,
        interests=interests, skills=skills, goal=goals[0] if goals else None,
    )
    zones = (dna.career_zones or [])[:3]
    if zones:
        memory.archive(
            user,
            f"User's Career DNA shows strongest interest in: {', '.join(zones)}.",
            ("dna", "career_focus"),
        )


async def refresh_dna_from_history(
    user: User, chat_history: list[dict], db: Session, focus: str | None = None
) -> CareerDNA:
    dna = get_or_create_dna(user, db)
    current = dna_dict(dna)
    revoked = revoked_terms(chat_history)
    student = {
        "name": user.display_name,
        "grade": user.grade,
        "school": user.school,
    }
    try:
        result = await gemini.complete_json(
            prompts.career_dna_prompt(chat_history, current, student),
            system=prompts.CAREER_DNA_SYSTEM,
        )
        if not isinstance(result, dict):
            raise ValueError("bad shape")
    except Exception as exc:
        print(f"[dna] refresh skipped: {exc}")
        return dna

    # Deterministic backstop: drop anything the student clearly revoked, even if the LLM
    # forgot to (e.g. "I don't like coding anymore" must remove coding, not keep it).
    cleaned = {field: _clean_list(result.get(field, current.get(field))) for field in PREFERENCE_FIELDS}
    if revoked:
        for field in PREFERENCE_FIELDS:
            cleaned[field] = prune(cleaned[field], revoked)

    update = CareerDNAUpdate(
        traits=_clean_list(result.get("traits", current.get("traits"))),
        motivations=cleaned["motivations"],
        strengths=_clean_list(result.get("strengths", current.get("strengths"))),
        development_areas=_clean_list(result.get("development_areas", current.get("development_areas"))),
        interests=cleaned["interests"],
        subjects=cleaned["subjects"],
        skills=cleaned["skills"],
        career_zones=cleaned["career_zones"],
        values=cleaned["values"],
        goals=cleaned["goals"],
        novi_reflection=str(result.get("novi_reflection") or ""),
        dna_filled=True,
    )
    new_dna = update_dna(user, update, db)
    _archive_shift(user, current, new_dna)
    return new_dna


async def build_dna_from_text(user: User, text: str, db: Session) -> CareerDNA:
    """One-shot DNA build from a student's own words (no chat history needed)."""
    dna = get_or_create_dna(user, db)
    current = dna_dict(dna)
    student = {
        "name": user.display_name,
        "grade": user.grade,
        "school": user.school,
    }
    try:
        result = await gemini.complete_json(
            prompts.dna_from_text_prompt(text, current, student),
            system=prompts.CAREER_DNA_SYSTEM,
        )
        if not isinstance(result, dict):
            raise ValueError("bad shape")
    except Exception as exc:
        print(f"[dna] magic build failed: {exc}")
        raise ValueError("Novi couldn't read that just yet — try telling her a little more") from exc

    cleaned = {field: _clean_list(result.get(field, current.get(field))) for field in PREFERENCE_FIELDS}
    update = CareerDNAUpdate(
        traits=_clean_list(result.get("traits", current.get("traits"))),
        motivations=cleaned["motivations"],
        strengths=_clean_list(result.get("strengths", current.get("strengths"))),
        development_areas=_clean_list(result.get("development_areas", current.get("development_areas"))),
        interests=cleaned["interests"],
        subjects=cleaned["subjects"],
        skills=cleaned["skills"],
        career_zones=cleaned["career_zones"],
        values=cleaned["values"],
        goals=cleaned["goals"],
        novi_reflection=str(result.get("novi_reflection") or ""),
        dna_filled=True,
    )
    new_dna = update_dna(user, update, db)
    _archive_shift(user, current, new_dna)
    return new_dna


def revoked_terms(chat_history: list[dict]) -> list[str]:
    """Extract topics the student has clearly moved away from (as lowercase phrases)."""
    terms: list[str] = []
    for m in chat_history:
        if m.get("role") != "user":
            continue
        text = str(m.get("content") or "")
        for match in _NEGATION_RE.finditer(text):
            subject = _subject(text[match.end() :].split())
            if subject:
                terms.append(subject)
        for match in _PREFER_OVER_RE.finditer(text):
            subject = _subject(match.group(1).split())
            if subject:
                terms.append(subject)
    return list(dict.fromkeys(t.lower() for t in terms if t))


def _subject(words: list[str]) -> str:
    """First meaningful multi-word topic after a signal phrase."""
    for i, w in enumerate(words):
        token = w.lower().strip("'\"")
        if len(token) >= 3 and token not in _STOPWORDS:
            pair = []
            for j in range(i, min(i + 2, len(words))):
                t = words[j].lower().strip("'\"")
                if len(t) < 2 or t in _STOPWORDS:
                    break
                pair.append(t)
            return " ".join(pair[:2])
    return ""


def prune(items: list[str], revoked: list[str]) -> list[str]:
    """Remove any item that contains a revoked topic (e.g. 'coding' in 'competitive coding')."""
    tokens = [re.escape(t) for phrase in revoked for t in phrase.split() if len(t) >= 3]
    if not tokens:
        return items
    pattern = re.compile("|".join(tokens))
    return [it for it in items if not pattern.search(it.lower())]


def _archive_shift(user: User, was: dict, now: CareerDNA) -> None:
    """When the student genuinely swaps one focus for another, record it for the mentor."""
    removed: list[str] = []
    added: list[str] = []
    for field in ("interests", "skills", "career_zones", "goals"):
        old = {x.lower() for x in (was.get(field) or [])}
        new = {x.lower() for x in (getattr(now, field) or [])}
        removed.extend([x for x in old - new if x not in removed])
        added.extend([x for x in new - old if x not in added])
    if not removed or not added:
        return
    try:
        memory.archive(
            user,
            f"User shifted their focus: moved away from {', '.join(removed[:3])} "
            f"toward {', '.join(added[:3])}.",
            ("dna", "shift"),
        )
    except Exception as exc:
        print(f"[dna] shift memory archive failed: {exc}")


def _clean_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return [str(value).strip()] if str(value).strip() else []


def reflect_dna(user: User, data: ReflectionUpdate, db: Session) -> CareerDNA:
    """Handle the 'Yes, that's me' / 'Not quite' feedback on Novi's reflection."""
    dna = get_or_create_dna(user, db)
    if data.accepted:
        dna.dna_filled = True
        db.commit()
        db.refresh(dna)
        try:
            memory.archive(
                user,
                "User confirmed their Career DNA reflection — it feels right.",
                ("dna", "reflection"),
            )
        except Exception as exc:
            print(f"[dna] reflect memory archive failed: {exc}")
    elif data.feedback and data.feedback.strip():
        dna.dna_filled = False
        db.commit()
        db.refresh(dna)
        try:
            memory.archive(
                user,
                f"User refined their Career DNA reflection: {data.feedback.strip()}.",
                ("dna", "reflection"),
            )
        except Exception as exc:
            print(f"[dna] reflect memory archive failed: {exc}")
    return dna


def dna_context(user: User, db: Session, dna: CareerDNA | None = None) -> dict:
    """A compact, current snapshot of the student's DNA used to ground every
    section (careers, universities, roadmap, passport, check-in) in who they are now."""
    dna = dna or get_dna(user, db)
    d = dna_dict(dna)
    zones = d.get("career_zones") or []
    goals = d.get("goals") or []
    interests = d.get("interests") or []
    subjects = d.get("subjects") or []
    skills = d.get("skills") or []
    return {
        "filled": bool(dna and dna.dna_filled),
        "grade": user.grade,
        "label": (zones or interests or [None])[0],
        "top_zone": zones[0] if zones else None,
        "top_goal": goals[0] if goals else None,
        "top_interest": interests[0] if interests else None,
        "top_skill": skills[0] if skills else None,
        "career_zones": zones,
        "goals": goals,
        "interests": interests,
        "subjects": subjects,
        "skills": skills,
    }