from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel, RoleBase, USER_ROLES


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    role: str = Field(default="student", pattern="^(student|parent)$")
    name: str = ""
    first_name: str = ""
    last_name: str = ""
    grade: int | None = Field(default=None, ge=9, le=12)
    school: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: RoleBase


class UserUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    grade: int | None = Field(default=None, ge=9, le=12)
    school: str | None = None