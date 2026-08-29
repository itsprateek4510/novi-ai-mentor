# NOVI - AI Student Mentor

An AI-powered chat interface for student guidance and career discovery.

## Tech Stack

- **Backend**: FastAPI (Python)
- **Database**: MySQL + Letta (for AI memory)
- **AI**: Google Gemini API (free tier)
- **Frontend**: HTML/CSS/JavaScript

## Prerequisites

1. **Docker Desktop** - Install from https://www.docker.com/products/docker-desktop
2. **Python 3.10+** - Already installed
3. **Gemini API Key** - Get free from https://makersuite.google.com/app/apikey

## Quick Start

### 1. Get Gemini API Key (Free)

1. Go to https://makersuite.google.com/app/apikey
2. Sign in with Google account
3. Click "Create API Key"
4. Copy the key

### 2. Update Environment Variables

Edit `backend/.env` and replace `your_gemini_api_key_here` with your actual API key:

```
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Start Services with Docker

```bash
# From the project root
docker-compose up -d
```

This starts:
- MySQL database (port 3306)
- Letta server (port 8283)
- Redis (port 6379)

### 4. Install Python Dependencies

```bash
# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

### 5. Start the Application

```bash
# From the project root
cd backend
source ../venv/bin/activate
python main.py
```

> 📖 For the memory & recall system (how NOVI remembers students across
> Grades 9–12, storage locations, dedup, caching, and operational commands)
> see **`MEMORY_SYSTEM.md`**.

### 6. Open the Application

Open your browser and go to:
```
http://localhost:8000
```

## Project Structure

```
novi_tech_app/
├── docker-compose.yml      # Docker services (MySQL, Letta, Redis)
├── backend/
│   ├── main.py            # FastAPI application
│   ├── database.py        # Database connection
│   ├── models.py          # SQLAlchemy models
│   ├── schemas.py         # Pydantic schemas
│   ├── services/
│   │   ├── letta_service.py   # Letta AI memory integration
│   │   ├── gemini_service.py  # Gemini API integration
│   │   └── auth_service.py    # Authentication
│   ├── init.sql           # Database schema
│   ├── requirements.txt   # Python dependencies
│   └── .env              # Environment variables
├── frontend/
│   ├── index.html         # Main chat interface
│   └── static/
│       ├── styles.css     # Styling
│       └── app.js         # Frontend logic
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create new account |
| POST | `/api/auth/login` | Login |
| POST | `/api/chat` | Send message |
| GET | `/api/conversations/{user_id}` | Get conversations |
| GET | `/api/conversations/{id}/messages` | Get messages |
| GET | `/api/user/{id}/career-dna` | Get Career DNA |
| POST | `/api/user/{id}/goals` | Create goal |
| GET | `/api/user/{id}/goals` | Get goals |

## Features

- ✅ Chat with AI mentor (Novi)
- ✅ Persistent conversations
- ✅ User authentication
- ✅ Career DNA profile
- ✅ Goals management
- ✅ Career Passport
- ✅ Modern, responsive UI

## Troubleshooting

### MySQL Connection Error
Make sure Docker is running:
```bash
docker-compose ps
```

### Letta Not Available
The app will fall back to Gemini directly if Letta is not available.

### Port Already in Use
Change the port in the uvicorn command:
```bash
uvicorn main:app --port 8001
```

## Next Steps

After MVP, you can add:
- Weekly check-ins
- University explorer
- Career matching
- Parent dashboard
- Admin panel
