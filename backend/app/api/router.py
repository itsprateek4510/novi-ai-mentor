from fastapi import APIRouter

from app.api import (
    auth,
    career_dna,
    careers,
    chat,
    checkins,
    dashboard,
    google_auth,
    memory,
    parents,
    passport,
    roadmap,
    universities,
)
from app.m3.api.routes import router as m3_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(google_auth.router)
api_router.include_router(chat.router)
api_router.include_router(careers.router)
api_router.include_router(universities.router)
api_router.include_router(career_dna.router)
api_router.include_router(roadmap.router)
api_router.include_router(passport.router)
api_router.include_router(checkins.router)
api_router.include_router(dashboard.router)
api_router.include_router(parents.router)
api_router.include_router(memory.router)

# Onboarding: the 15-step conversational engine (app/routers/onboarding.py) is the
# only onboarding engine. Its /state + /answer + /flow/* + /voice/* routes replace
# the legacy flow engine (app/api/onboarding.py, removed) at /onboarding.
from app.routers.onboarding import router as onboarding_flow_router

api_router.include_router(onboarding_flow_router)

api_router.include_router(m3_router, prefix="/m3")