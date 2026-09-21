"""ElevenLabs voice helpers for conversational onboarding.

Backs three voice routes: TTS streaming (/voice/speak), STT (/voice/transcribe)
and the voice-aware answer path (via voice_resolve). All calls go straight to
the ElevenLabs REST API through httpx — no SDK dependency.
"""

from collections.abc import AsyncIterator

import httpx

from app.core.config import settings

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"
# Current production STT model per ElevenLabs docs (Scribe v2, batch transcription).
ELEVENLABS_STT_MODEL_ID = "scribe_v2"


class VoiceError(Exception):
    """Raised when an ElevenLabs request fails (config, HTTP, or parse error)."""


async def speak(text: str) -> AsyncIterator[bytes]:
    """Stream TTS audio for `text` from the ElevenLabs streaming endpoint."""
    if not settings.ELEVENLABS_API_KEY:
        raise VoiceError("ELEVENLABS_API_KEY is not configured")
    if not settings.ELEVENLABS_VOICE_ID:
        raise VoiceError("ELEVENLABS_VOICE_ID is not configured")

    url = ELEVENLABS_TTS_URL.format(voice_id=settings.ELEVENLABS_VOICE_ID)
    payload = {"text": text, "model_id": settings.ELEVENLABS_MODEL_ID}
    timeout = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            async with client.stream(
                "POST",
                url,
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
                json=payload,
            ) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    yield chunk
        except httpx.HTTPError as exc:
            raise VoiceError(f"ElevenLabs TTS failed: {exc}") from exc


async def transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe `audio_bytes` with ElevenLabs speech-to-text and return the text."""
    if not settings.ELEVENLABS_API_KEY:
        raise VoiceError("ELEVENLABS_API_KEY is not configured")

    timeout = httpx.Timeout(connect=10.0, read=180.0, write=60.0, pool=10.0)
    files = {"file": (filename, audio_bytes, "application/octet-stream")}
    data = {"model_id": ELEVENLABS_STT_MODEL_ID}

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(
                ELEVENLABS_STT_URL,
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
                files=files,
                data=data,
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise VoiceError(f"ElevenLabs STT failed: {exc}") from exc
        except ValueError as exc:
            raise VoiceError(f"ElevenLabs STT returned an invalid response: {exc}") from exc

    text = payload.get("text") if isinstance(payload, dict) else None
    return str(text or "").strip()