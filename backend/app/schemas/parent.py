from pydantic import BaseModel

from app.schemas.common import ORMModel
from app.schemas.dashboard import ParentChildSummary


class LinkStudentRequest(BaseModel):
    student_email: str


class ChildOut(ORMModel):
    id: int
    email: str
    first_name: str
    last_name: str
    grade: int | None = None
    school: str | None = None


class AdvisorAsk(BaseModel):
    question: str
    child_id: int | None = None


class AdvisorResponse(BaseModel):
    answer: str


class ParentChildrenOut(BaseModel):
    children: list[ParentChildSummary]