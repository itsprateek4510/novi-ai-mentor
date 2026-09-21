import logging
import secrets
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.core.database import get_db
from app.services import auth as auth_service

logger = logging.getLogger("novi.google_auth")

router = APIRouter(tags=["auth"])


@router.get("/auth/google", include_in_schema=False)
async def google_oauth_start(next: str = "/login"):
    """Redirect the browser to Google's consent screen.

    `next` is the frontend route (/login or /signup) the user returns to.
    A CSRF nonce is stored in an httpOnly cookie and echoed in the OAuth `state`.
    """
    if not auth_service.google_is_configured():
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")
    if not _safe_next(next):
        next = "/login"

    state = secrets.token_urlsafe(32)
    response = RedirectResponse(auth_service.build_google_authorize_url(state, next), status_code=302)
    response.set_cookie("google_oauth_state", state, max_age=600, httponly=True, samesite="lax")
    return response


@router.get("/auth/google/callback", include_in_schema=False)
async def google_oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    db: Session = Depends(get_db),
):
    """Exchange the Google code, log the user in, and bounce them back to the frontend."""
    if not auth_service.google_is_configured() or not code or not state:
        return _google_fail(request, detail="google_oauth_requires_code")

    expected = request.cookies.get("google_oauth_state")
    if not expected:
        return _google_fail(request, detail="google_oauth_expired")

    csrf, _, next_path = state.partition(":")
    next_path = unquote(next_path)
    if not _safe_next(next_path):
        next_path = "/login"
    if csrf != expected:
        logger.warning("google OAuth state mismatch (CSRF guard) for path %s", next_path)
        return _google_fail(request, detail="google_oauth_verification_failed")

    try:
        user, is_new = await auth_service.google_login(code, db)
    except HTTPException as exc:
        logger.warning("google login rejected: %s", exc.detail)
        return _google_fail(request, detail="google_oauth_rejected")
    except Exception:
        logger.exception("google login failed unexpectedly", exc_info=True)
        return _google_fail(request, detail="google_oauth_failed")

    role = getattr(user.role, "value", user.role)
    token = security.create_access_token(str(user.id), str(role))
    dest = f"{settings.FRONTEND_URL.rstrip('/')}{next_path}?google_token={token}&google_new={'1' if is_new else '0'}"
    response = RedirectResponse(dest, status_code=302)
    response.delete_cookie("google_oauth_state")
    return response


def _safe_next(path: str) -> bool:
    return bool(path) and path.startswith("/") and not path.startswith("//") and ".." not in path


def _google_fail(request: Request, detail: str = "google_oauth_failed") -> RedirectResponse:
    response = RedirectResponse(
        f"{settings.FRONTEND_URL.rstrip('/')}/login?google_error={detail}",
        status_code=302,
    )
    if request.cookies.get("google_oauth_state"):
        response.delete_cookie("google_oauth_state")
    return response