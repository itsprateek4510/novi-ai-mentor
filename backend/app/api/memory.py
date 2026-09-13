from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_student
from app.models.user import User
from app.schemas.memory import StudentMemoryOut
from app.services.chat import _lazy_ensure_agent
from app.services.providers import memory

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("", response_model=StudentMemoryOut)
async def student_memory(user: User = Depends(get_current_student), db: Session = Depends(get_db)):
    """Easy retrieval of a student's long-term Letta memory, grouped by school year."""
    agent_id = _lazy_ensure_agent(user, db)
    if not agent_id or not memory.is_reachable():
        return StudentMemoryOut()
    return memory.timeline(agent_id)