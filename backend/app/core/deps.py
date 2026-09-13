from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


def _get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials)
    if payload is None or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def get_current_user(
    user: User = Depends(_get_current_user),
) -> User:
    return user


def get_current_student(
    user: User = Depends(_get_current_user),
) -> User:
    if user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Student access required")
    return user


def get_current_parent(
    user: User = Depends(_get_current_user),
) -> User:
    if user.role != UserRole.PARENT:
        raise HTTPException(status_code=403, detail="Parent access required")
    return user