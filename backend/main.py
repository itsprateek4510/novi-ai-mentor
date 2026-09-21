from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List
import os
import json
from datetime import datetime

from database import get_db, engine, Base
from models import User, Conversation, Message, CareerDNA, Goal, CareerPassport
from services.letta_service import LettaService
from services.gemini_service import GeminiService
from services.auth_service import AuthService
from schemas import (
    UserCreate, UserLogin, UserResponse,
    ChatRequest, ChatResponse, ConversationResponse,
    GoalCreate, GoalResponse, PassportItemCreate, PassportItemResponse
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="NOVI - AI Student Mentor", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="../frontend/static"), name="static")

_dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend/dist"))
if os.path.isdir(_dist_dir):
    app.mount("/dist", StaticFiles(directory=_dist_dir), name="dist")

letta_service = LettaService()
gemini_service = GeminiService()
auth_service = AuthService()

@app.get("/", response_class=HTMLResponse)
async def root():
    index = os.path.join(_dist_dir, "index.html")
    if os.path.exists(index):
        return FileResponse(index)
    return HTMLResponse(
        "<h1>NOVI API</h1><p>Backend is running. The UI is served by the Next.js app — run "
        "<code>npm run dev</code> in <code>frontend/</code> and open http://localhost:3000.</p>"
    )

@app.post("/api/auth/signup", response_model=UserResponse)
async def signup(user: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = auth_service.hash_password(user.password)
    db_user = User(
        email=user.email,
        password_hash=hashed_password,
        first_name=user.first_name,
        last_name=user.last_name,
        grade=user.grade,
        school=user.school
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    try:
        agent_id = await letta_service.create_agent(
            user_id=db_user.id,
            name=f"{db_user.first_name} {db_user.last_name}",
            grade=db_user.grade
        )
        db_user.letta_agent_id = agent_id
        db.commit()
    except Exception as e:
        print(f"Error creating Letta agent: {e}")

    return db_user

@app.post("/api/auth/login", response_model=UserResponse)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not auth_service.verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return user

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """Send message through Letta - Letta uses Gemini as LLM and manages its own memory"""

    conversation = db.query(Conversation).filter(
        Conversation.id == request.conversation_id
    ).first()

    if not conversation:
        conversation = Conversation(user_id=request.user_id, title="New Conversation")
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=request.message
    )
    db.add(user_message)
    db.commit()

    user = db.query(User).filter(User.id == request.user_id).first()

    # Ensure existing agents have the memory/archival/conversation tools attached.
    if user and user.letta_agent_id:
        try:
            await letta_service.upgrade_agent_tools(user.letta_agent_id)
        except Exception as e:
            print(f"Error upgrading agent tools: {e}")

    # Route through Letta - Letta agent uses Gemini to respond AND manages memory via tools
    response = None
    if user.letta_agent_id:
        try:
            print(f"Sending to Letta agent: {user.letta_agent_id}")
            response = await letta_service.send_message(
                agent_id=user.letta_agent_id,
                message=request.message
            )
            print(f"Letta response: {response[:100]}...")
        except Exception as e:
            print(f"Letta error: {e}")
            response = None

    # Fallback to Gemini direct only if Letta completely fails
    if not response:
        try:
            print("Letta failed, falling back to Gemini direct...")
            letta_context = ""
            if user.letta_agent_id:
                try:
                    memory = await letta_service.get_memory(user.letta_agent_id)
                    blocks = memory.get("blocks", [])
                    for block in blocks:
                        letta_context += f"{block['label']}: {block['value']}\n"
                except:
                    pass

            response = await gemini_service.generate_response(
                message=request.message,
                user_context={
                    "name": user.first_name,
                    "grade": user.grade,
                    "school": user.school,
                    "letta_memory": letta_context
                }
            )
        except Exception as e:
            print(f"Gemini fallback error: {e}")
            response = "I'm having a little trouble connecting right now. Could you try again?"

    ai_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=response
    )
    db.add(ai_message)
    db.commit()

    # Auto-update Letta memory block with latest student info
    if user.letta_agent_id:
        try:
            messages = db.query(Message).filter(
                Message.conversation_id == conversation.id
            ).order_by(Message.created_at).all()
            chat_history = [{"role": m.role, "content": m.content} for m in messages]
            await letta_service.auto_update_memory(
                agent_id=user.letta_agent_id,
                chat_history=chat_history,
                user_context={
                    "name": user.first_name,
                    "grade": user.grade,
                    "school": user.school
                }
            )
        except Exception as e:
            print(f"Error auto-updating Letta memory: {e}")

        # Extract durable facts and insert into archival memory (deduped + grade-tagged)
        try:
            messages = db.query(Message).filter(
                Message.conversation_id == conversation.id
            ).order_by(Message.created_at).all()
            chat_history = [{"role": m.role, "content": m.content} for m in messages]
            existing_facts = await letta_service.existing_archival_texts(user.letta_agent_id)
            facts = await gemini_service.extract_archival_facts(
                chat_history,
                grade=user.grade,
                existing_facts=existing_facts
            )
            grade_tag = f"grade{user.grade}" if user.grade else "grade"
            for fact in facts:
                if fact.strip().lower() in existing_facts:
                    continue
                inserted = await letta_service.insert_archival_memory(
                    agent_id=user.letta_agent_id,
                    content=fact,
                    tags=["student", grade_tag]
                )
                if inserted:
                    print(f"Archival memory inserted ({grade_tag}): {fact[:80]}...")
        except Exception as e:
            print(f"Error writing archival memory: {e}")

    # Auto-extract Career DNA to MySQL every 3 messages
    try:
        msg_count = db.query(Message).filter(
            Message.conversation_id == conversation.id
        ).count()
        if msg_count % 3 == 0:
            await _auto_extract_and_save(user, conversation.id, db)
    except Exception as e:
        print(f"Error auto-extracting: {e}")

    return ChatResponse(
        message=response,
        conversation_id=conversation.id,
        message_id=ai_message.id
    )

async def _auto_extract_and_save(user: User, conversation_id: int, db: Session):
    """Extract insights from chat and save Career DNA + Goals to MySQL"""
    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at).all()

    if len(messages) < 2:
        return

    chat_history = [{"role": m.role, "content": m.content} for m in messages]

    insights = await gemini_service.extract_student_insights(
        chat_history=chat_history,
        user_context={
            "name": user.first_name,
            "grade": user.grade,
            "school": user.school
        }
    )

    career_dna = db.query(CareerDNA).filter(CareerDNA.user_id == user.id).first()
    if not career_dna:
        career_dna = CareerDNA(user_id=user.id)
        db.add(career_dna)

    if insights.get("traits"):
        career_dna.traits = json.dumps(insights["traits"])
    if insights.get("motivations"):
        career_dna.motivations = json.dumps(insights["motivations"])
    if insights.get("strengths"):
        career_dna.strengths = json.dumps(insights["strengths"])
    if insights.get("interests"):
        career_dna.interests = json.dumps(insights["interests"])
    if insights.get("career_zones"):
        career_dna.career_zones = json.dumps(insights["career_zones"])

    db.commit()
    print(f"Career DNA updated for user {user.id}")

    valid_categories = {"career", "university", "personal", "extracurricular", "academic"}
    existing_goals = db.query(Goal).filter(Goal.user_id == user.id).all()
    existing_titles = {g.title.lower() for g in existing_goals}

    for goal_data in insights.get("goals", []):
        if goal_data.get("title") and goal_data["title"].lower() not in existing_titles:
            category = goal_data.get("category", "personal")
            if category not in valid_categories:
                category = "personal"
            new_goal = Goal(
                user_id=user.id,
                title=goal_data["title"],
                description=goal_data.get("description", ""),
                category=category,
                status="active"
            )
            db.add(new_goal)
            print(f"New goal created: {goal_data['title']}")

    db.commit()

@app.get("/api/conversations/{user_id}", response_model=List[ConversationResponse])
async def get_conversations(user_id: int, db: Session = Depends(get_db)):
    conversations = db.query(Conversation).filter(
        Conversation.user_id == user_id
    ).order_by(Conversation.updated_at.desc()).all()
    return conversations

@app.get("/api/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: int, db: Session = Depends(get_db)):
    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at).all()
    return messages

@app.get("/api/user/{user_id}/letta-memory")
async def get_letta_memory(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.letta_agent_id:
        return {"error": "No Letta agent found"}

    try:
        memory = await letta_service.get_memory(user.letta_agent_id)
        return memory
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/user/{user_id}/letta-archival")
async def get_letta_archival(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.letta_agent_id:
        return {"error": "No Letta agent found"}

    try:
        archival = await letta_service.get_archival_memory(user.letta_agent_id)
        return {"archival_memory": archival}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/user/{user_id}/career-dna")
async def get_career_dna(user_id: int, db: Session = Depends(get_db)):
    career_dna = db.query(CareerDNA).filter(CareerDNA.user_id == user_id).first()
    if not career_dna:
        return {"message": "Career DNA not yet generated"}
    return career_dna

@app.post("/api/user/{user_id}/career-dna")
async def update_career_dna(user_id: int, data: dict, db: Session = Depends(get_db)):
    career_dna = db.query(CareerDNA).filter(CareerDNA.user_id == user_id).first()
    if not career_dna:
        career_dna = CareerDNA(user_id=user_id)
        db.add(career_dna)

    career_dna.traits = data.get("traits", career_dna.traits)
    career_dna.motivations = data.get("motivations", career_dna.motivations)
    career_dna.strengths = data.get("strengths", career_dna.strengths)
    career_dna.interests = data.get("interests", career_dna.interests)
    career_dna.career_zones = data.get("career_zones", career_dna.career_zones)

    db.commit()
    return career_dna

@app.post("/api/user/{user_id}/goals", response_model=GoalResponse)
async def create_goal(user_id: int, goal: GoalCreate, db: Session = Depends(get_db)):
    db_goal = Goal(
        user_id=user_id,
        title=goal.title,
        description=goal.description,
        category=goal.category,
        target_date=goal.target_date
    )
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return db_goal

@app.get("/api/user/{user_id}/goals", response_model=List[GoalResponse])
async def get_goals(user_id: int, db: Session = Depends(get_db)):
    goals = db.query(Goal).filter(Goal.user_id == user_id).all()
    return goals

@app.post("/api/user/{user_id}/passport", response_model=PassportItemResponse)
async def add_passport_item(user_id: int, item: PassportItemCreate, db: Session = Depends(get_db)):
    db_item = CareerPassport(
        user_id=user_id,
        category=item.category,
        title=item.title,
        description=item.description,
        date_achieved=item.date_achieved,
        certificate_url=item.certificate_url
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.get("/api/user/{user_id}/passport", response_model=List[PassportItemResponse])
async def get_passport(user_id: int, db: Session = Depends(get_db)):
    items = db.query(CareerPassport).filter(CareerPassport.user_id == user_id).all()
    return items

@app.get("/api/user/{user_id}/dashboard")
async def get_dashboard(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    career_dna = db.query(CareerDNA).filter(CareerDNA.user_id == user_id).first()
    career_dna_data = None
    if career_dna:
        career_dna_data = {
            "traits": json.loads(career_dna.traits) if career_dna.traits else {},
            "motivations": json.loads(career_dna.motivations) if career_dna.motivations else {},
            "strengths": json.loads(career_dna.strengths) if career_dna.strengths else [],
            "interests": json.loads(career_dna.interests) if career_dna.interests else [],
            "career_zones": json.loads(career_dna.career_zones) if career_dna.career_zones else []
        }

    goals = db.query(Goal).filter(Goal.user_id == user_id).all()
    goals_data = [{
        "id": g.id,
        "title": g.title,
        "description": g.description,
        "category": g.category,
        "status": g.status,
        "target_date": g.target_date.isoformat() if g.target_date else None
    } for g in goals]

    passport = db.query(CareerPassport).filter(CareerPassport.user_id == user_id).all()
    passport_data = [{
        "id": p.id,
        "category": p.category,
        "title": p.title,
        "description": p.description,
        "date_achieved": p.date_achieved.isoformat() if p.date_achieved else None,
        "verified": p.verified
    } for p in passport]

    letta_memory = {}
    letta_archival = []
    if user.letta_agent_id:
        try:
            memory = await letta_service.get_memory(user.letta_agent_id)
            blocks = {b["label"]: b["value"] for b in memory.get("blocks", [])}
            letta_memory = blocks
        except:
            pass
        try:
            letta_archival = await letta_service.get_archival_memory(user.letta_agent_id)
        except:
            pass

    msg_count = db.query(Message).join(Conversation).filter(Conversation.user_id == user_id).count()
    conv_count = db.query(Conversation).filter(Conversation.user_id == user_id).count()

    return {
        "user": {
            "name": f"{user.first_name} {user.last_name}",
            "grade": user.grade,
            "school": user.school,
            "email": user.email
        },
        "career_dna": career_dna_data,
        "goals": goals_data,
        "passport": passport_data,
        "letta_memory": letta_memory,
        "letta_archival": letta_archival,
        "stats": {
            "total_messages": msg_count,
            "total_conversations": conv_count
        }
    }

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "NOVI API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
