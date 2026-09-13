from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class CheckinCreate(BaseModel):
    week_start: date | None = None
    accomplishments: str = ""
    learnings: str = ""
    challenges: str = ""
    pride: str = ""
    next_week: str = ""


class CheckinOut(ORMModel):
    id: int
    week_start: date
    accomplishments: str
    learnings: str
    challenges: str
    pride: str
    next_week: str
    ai_summary: dict | None = None
    status: str
    updated_at: datetime | None = None


class CheckinSummaryOut(BaseModel):
    wins: int = 0
    new_skills: list[str] = []
    milestones: list[str] = []
    priorities_next_week: list[str] = []