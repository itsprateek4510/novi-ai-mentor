import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import PROJECT_ROOT, settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("novi")

FRONTEND_DIR = Path(settings.FRONTEND_DIR)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="NOVI — The Operating System for Student Success",
    docs_url="/docs",
    openapi_url="/api/v1/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR / "static")), name="static")


@app.middleware("http")
async def no_cache(request, call_next):
    response = await call_next(request)
    if request.url.path in ("/", "/index.html"):  # root HTML must always be fresh, else browsers re-use the old app
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


@app.get("/", include_in_schema=False)
async def index():
    index_file = FRONTEND_DIR / "index.html"
    return FileResponse(str(index_file)) if index_file.exists() else JSONResponse(
        {"message": "NOVI API is running. Frontend not found — see /docs for the API."}
    )


@app.get("/api/v1/health", tags=["health"])
async def health():
    from app.services.providers import memory

    return {
        "status": "healthy",
        "service": f"{settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "memory": memory.source(),
    }


@app.get("/.well-known/health")
async def well_known_health():
    return {"status": "ok"}