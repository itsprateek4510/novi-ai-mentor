from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_student
from app.models.user import User
from app.schemas.career_dna import CareerDNAOut, CareerDNAUpdate, MagicDNARequest, ReflectionUpdate
from app.services import career_dna as dna_service

router = APIRouter(prefix="/dna", tags=["career-dna"])


@router.get("", response_model=CareerDNAOut)
async def get_dna(user: User = Depends(get_current_student), db: Session = Depends(get_db)):
    dna = dna_service.get_or_create_dna(user, db)
    return _payload(dna)


@router.patch("", response_model=CareerDNAOut)
async def update_dna(
    data: CareerDNAUpdate,
    user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    dna = dna_service.update_dna(user, data, db)
    return _payload(dna)


@router.post("/magic", response_model=CareerDNAOut)
async def magic_dna(
    data: MagicDNARequest,
    user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    text = (data.text or "").strip()
    if len(text) < 12:
        raise HTTPException(status_code=422, detail="Tell Novi a little more about yourself first")
    try:
        dna = await dna_service.build_dna_from_text(user, text, db)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    from app.services.state_sync import push as push_state
    push_state(user, db)
    return _payload(dna)


@router.post("/refresh", response_model=CareerDNAOut)
async def refresh_dna(user: User = Depends(get_current_student), db: Session = Depends(get_db)):
    conv_id, chat_history = _recent_history(user, db)
    if not chat_history:
        raise HTTPException(status_code=400, detail="Chat with Novi first so your DNA has something to learn from")
    dna = await dna_service.refresh_dna_from_history(user, chat_history, db, conversation_id=conv_id)
    return _payload(dna)


@router.post("/reflect", response_model=CareerDNAOut)
async def reflect(
    data: ReflectionUpdate,
    user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    dna = dna_service.reflect_dna(user, data, db)
    return _payload(dna)


@router.get("/context")
async def dna_context(user: User = Depends(get_current_student), db: Session = Depends(get_db)):
    return dna_service.dna_context(user, db)


def _payload(dna) -> dict:
    return {
        "id": dna.id,
        "user_id": dna.user_id,
        "traits": dna.traits or [],
        "motivations": dna.motivations or [],
        "strengths": dna.strengths or [],
        "development_areas": dna.development_areas or [],
        "interests": dna.interests or [],
        "subjects": dna.subjects or [],
        "skills": dna.skills or [],
        "career_zones": dna.career_zones or [],
        "values": dna.values or [],
        "goals": dna.goals or [],
        "novi_reflection": dna.novi_reflection or "",
        "dna_filled": dna.dna_filled,
        "updated_at": dna.updated_at.isoformat() if dna.updated_at else None,
        "sources": dna.sources or {},
        "excluded": dna.excluded or [],
    }


def _recent_history(user: User, db: Session) -> tuple[int | None, list[dict]]:
    from app.services.chat import list_conversations, get_chat_history

    convos = list_conversations(user, db)
    if not convos:
        return None, []
    # Pull evidence from the student's recent conversations, newest first,
    # so DNA reflects what Novi has actually heard across chats.
    newest = convos[0]
    history: list[dict] = []
    for conv in convos[:6]:
        for m in get_chat_history(user, conv.id, db)[-12:]:
            history.append({**m, "conversation_id": conv.id})
    return newest.id, history[-40:]