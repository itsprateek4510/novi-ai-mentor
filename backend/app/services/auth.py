from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import security
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, SignupRequest, UserUpdate
from app.services.providers import memory


async def signup(data: SignupRequest, db: Session) -> User:
    existing = db.scalar(select(User).where(User.email == data.email.lower()))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=data.email.lower(),
        password_hash=security.hash_password(data.password),
        role=UserRole(data.role) if data.role in ("student", "parent") else UserRole.STUDENT,
        first_name=data.name or data.first_name,
        last_name=data.last_name,
        grade=data.grade,
        school=data.school,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if user.role == UserRole.STUDENT:
        try:
            agent_id = memory.ensure_agent(
                user_id=user.id, name=user.display_name, grade=user.grade,
                school=user.school or None, existing=None,
            )
            if agent_id:
                user.letta_agent_id = agent_id
                db.commit()
        except Exception as exc:
            print(f"[auth] agent creation skipped: {exc}")
    return user


def login(data: LoginRequest, db: Session) -> User:
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if not user or not security.verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    return user


def update_profile(user: User, data: UserUpdate, db: Session) -> User:
    if data.first_name is not None:
        user.first_name = data.first_name
    if data.last_name is not None:
        user.last_name = data.last_name
    if data.grade is not None:
        user.grade = data.grade
    if data.school is not None:
        user.school = data.school
    db.commit()
    db.refresh(user)
    return user