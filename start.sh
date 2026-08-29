#!/bin/bash

echo "🚀 Starting NOVI - AI Student Mentor"
echo "===================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Check if .env exists and has API key
if [ -f "backend/.env" ]; then
    if grep -q "your_gemini_api_key_here" backend/.env; then
        echo "⚠️  Please update your Gemini API key in backend/.env"
        echo "   Get a free key from: https://makersuite.google.com/app/apikey"
        echo ""
        read -p "Press Enter after updating the API key..."
    fi
fi

# Start Docker services
echo "📦 Starting Docker services (MySQL, Letta, Redis)..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Install Python dependencies
echo "📚 Installing Python dependencies..."
source venv/bin/activate 2>/dev/null || true
pip install -r backend/requirements.txt -q

# Start the application
echo ""
echo "✨ Starting NOVI server..."
echo "   Open http://localhost:8000 in your browser"
echo ""
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
