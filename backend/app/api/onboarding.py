from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_student
from app.models.user import User
from app.schemas.onboarding import OnboardingOut
from app.services import onboarding as onboarding_service

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("", response_model=OnboardingOut)
async def get_onboarding(
    user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    return onboarding_service.onboarding(db, user)