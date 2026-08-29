# Quick Setup Guide

## 3 Steps to Run NOVI

### Step 1: Get Free Gemini API Key
1. Go to https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Copy the key (starts with `AIzaSy...`)

### Step 2: Update API Key
Open `backend/.env` and replace:
```
GEMINI_API_KEY=your_gemini_api_key_here
```
with:
```
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxx
```

### Step 3: Run the App
```bash
# Make sure Docker Desktop is running, then:
./start.sh
```

Open http://localhost:8000

---

## That's it! 🎉

You can now chat with Novi, your AI student mentor.
