from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_parent
from app.models.user import User
from app.schemas.dashboard import ParentDashboardOut
from app.schemas.parent import AdvisorAsk, AdvisorResponse, LinkStudentRequest
from app.services import parents as parent_service

router = APIRouter(prefix="/parents", tags=["parents"])


@router.post("/link")
async def link_student(
    data: LinkStudentRequest,
    parent: User = Depends(get_current_parent),
    db: Session = Depends(get_db),
):
    student = parent_service.link_student(db, parent, data.student_email)
    return {"linked": True, "student": {"id": student.id, "name": student.display_name}}


@router.get("/dashboard", response_model=ParentDashboardOut)
async def parent_dashboard(parent: User = Depends(get_current_parent), db: Session = Depends(get_db)):
    return parent_service.parent_dashboard(db, parent)  # type: ignore[arg-type]


@router.post("/advisor", response_model=AdvisorResponse)
async def advisor(
    data: AdvisorAsk,
    parent: User = Depends(get_current_parent),
    db: Session = Depends(get_db),
):
    answer = await parent_service.advisor(db, parent, data.question, data.child_id)
    return AdvisorResponse(answer=answer)