from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_student
from app.models.user import User
from app.schemas.university import (
    ReadinessRequest,
    UniversityFilters,
    UniversityMatchOut,
    UniversityOut,
)
from app.services import universities as uni_service

router = APIRouter(prefix="/universities", tags=["universities"])


@router.get("", response_model=list[UniversityOut])
async def universities(
    q: str | None = None,
    country: str | None = None,
    subject: str | None = None,
    min_rank: int | None = None,
    max_fees: int | None = None,
    university_type: str | None = None,
    scholarships: bool | None = None,
    limit: int = 30,
    db: Session = Depends(get_db),
):
    filters = UniversityFilters(
        q=q,
        country=country,
        subject=subject,
        min_rank=min_rank,
        max_fees=max_fees,
        university_type=university_type,
        scholarships=scholarships,
        limit=limit,
    )
    return uni_service.search_universities(db, filters)


@router.get("/filters")
async def filters(db: Session = Depends(get_db)):
    return {"countries": uni_service.list_countries(db), "subjects": uni_service.list_subjects(db)}


@router.get("/recommended", response_model=list[UniversityMatchOut])
async def recommended(user: User = Depends(get_current_student), db: Session = Depends(get_db)):
    return uni_service.recommend(db, user)


@router.post("/readiness", response_model=UniversityMatchOut)
async def readiness(
    request: ReadinessRequest,
    user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    try:
        result = await uni_service.readiness(db, user, request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return result


@router.get("/{slug}", response_model=UniversityOut)
async def university_detail(slug: str, db: Session = Depends(get_db)):
    university = uni_service.get_university(db, slug=slug)
    if not university:
        raise HTTPException(status_code=404, detail="University not found")
    return university