from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_student
from app.models.user import User
from app.schemas.checkin import CheckinCreate, CheckinOut, CheckinSummaryOut
from app.services import checkins as checkin_service
from app.services import state_sync

router = APIRouter(prefix="/checkins", tags=["check-ins"])


def _sync(user: User, db: Session) -> None:
    """Keep Letta's state memory in step with any check-in change."""
    try:
        state_sync.push(user, db)
    except Exception as exc:
        print(f"[sync] checkin state push failed: {exc}")


@router.get("", response_model=list[CheckinOut])
async def list_checkins(user: User = Depends(get_current_student), db: Session = Depends(get_db)):
    return checkin_service.list_checkins(db, user)


@router.get("/current", response_model=CheckinOut)
async def current_checkin(user: User = Depends(get_current_student), db: Session = Depends(get_db)):
    return checkin_service.get_or_create_current(db, user)


@router.post("", response_model=CheckinOut)
async def save_checkin(
    data: CheckinCreate,
    user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    result = checkin_service.save_answers(db, user, data)
    _sync(user, db)
    return result


@router.post("/summarize", response_model=CheckinOut)
async def summarize_checkin(
    checkin_id: int | None = None,
    user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    result = await checkin_service.summarize(db, user, checkin_id)
    _sync(user, db)
    return result