from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_student
from app.models.user import User
from app.schemas.chat import ChatRequest, ChatResponse, ConversationOut, MessageOut
from app.services import chat as chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def send_message(
    data: ChatRequest,
    user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    result = await chat_service.handle_message(user, data.message, data.conversation_id, db)
    return ChatResponse(**result)


@router.get("/conversations", response_model=list[ConversationOut])
async def conversations(user: User = Depends(get_current_student), db: Session = Depends(get_db)):
    return chat_service.list_conversations(user, db)


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
async def messages(
    conversation_id: int,
    user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    if not chat_service.list_messages(user, conversation_id, db):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return chat_service.list_messages(user, conversation_id, db)