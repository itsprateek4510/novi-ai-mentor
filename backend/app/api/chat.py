import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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


@router.post("/stream")
async def send_message_stream(
    data: ChatRequest,
    user: User = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    async def _stream():
        try:
            result = await chat_service.handle_message(user, data.message, data.conversation_id, db)
            yield f"data: {json.dumps({'type': 'meta', 'conversation_id': result['conversation_id'], 'message_id': result.get('message_id')})}\n\n"
            yield f"data: {json.dumps({'type': 'delta', 'text': result['message']})}\n\n"
        except Exception as exc:  # surface errors to the client instead of dropping the stream
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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