from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from enum import Enum

# User schemas
class UserCreate(BaseModel):
    email: str
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    grade: Optional[int] = None
    school: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    grade: Optional[int]
    school: Optional[str]
    created_at: datetime
    is_active: bool
    letta_agent_id: Optional[str]
    
    class Config:
        from_attributes = True

# Chat schemas
class ChatRequest(BaseModel):
    message: str
    user_id: int
    conversation_id: Optional[int] = None

class ChatResponse(BaseModel):
    message: str
    conversation_id: int
    message_id: int

# Conversation schemas
class ConversationResponse(BaseModel):
    id: int
    title: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# Career DNA schemas
class CareerDNAResponse(BaseModel):
    id: int
    user_id: int
    traits: Optional[Dict[str, Any]]
    motivations: Optional[Dict[str, Any]]
    strengths: Optional[Dict[str, Any]]
    interests: Optional[Dict[str, Any]]
    career_zones: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

# Goal schemas
class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str  # career, university, personal
    target_date: Optional[date] = None

class GoalResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str]
    category: str
    status: str
    target_date: Optional[date]
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

# Career Passport schemas
class PassportItemCreate(BaseModel):
    category: str  # projects, competitions, certifications, etc.
    title: str
    description: Optional[str] = None
    date_achieved: Optional[date] = None
    certificate_url: Optional[str] = None

class PassportItemResponse(BaseModel):
    id: int
    user_id: int
    category: str
    title: str
    description: Optional[str]
    date_achieved: Optional[date]
    certificate_url: Optional[str]
    verified: bool
    created_at: datetime
    
    class Config:
        from_attributes = True
