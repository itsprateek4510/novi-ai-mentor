/* ------------------------------------------------------------------ *
 * Text-to-speech with web-synthesis fallback.
 *
 * Primary: POST /api/v1/onboarding/voice/speak (ElevenLabs streamed MP3).
 * Fallback: the browser's Web Speech API (speechSynthesis) whenever the
 * ElevenLabs call fails — e.g. no API key, 4xx/5xx (including 402
 * payment-required when the account has no credits), or a non-audio
 * response. Constants to tune: SPEAK_RATE, SPEAK_TIMEOUT_MS.
 * ------------------------------------------------------------------ */
import { API, getApiToken } from "./api";

const SPEAK_RATE = 1.05;
const SPEAK_TIMEOUT_MS = 45000;

export const VOICE_KEY = "novi_voice_on";

let _audio = null;
let _synthTimer = null;

function stopWebSynth() {
  if (_synthTimer) {
    clearTimeout(_synthTimer);
    _synthTimer = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function stopAudio() {
  if (_audio) {
    _audio.pause();
    _audio.src = "";
  }
}

export function stopAll() {
  stopAudio();
  stopWebSynth();
}

export function webSpeak(text) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(String(text || ""));
  u.rate = SPEAK_RATE;
  _synthTimer = setTimeout(stopWebSynth, SPEAK_TIMEOUT_MS);
  window.speechSynthesis.speak(u);
}

/* Speak `text`. Never rejects: ElevenLabs failure always falls back to the
 * browser's speechSynthesis. Fire-and-forget from the UI. */
export async function speakText(text) {
  const t = String(text || "").trim();
  if (!t || typeof window === "undefined") return;
  stopAll();
  try {
    const res = await fetch(`${API}/onboarding/voice/speak`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getApiToken() ? { Authorization: `Bearer ${getApiToken()}` } : {}),
      },
      body: JSON.stringify({ text: t }),
    });
    if (!res.ok) throw new Error(`ElevenLabs unavailable (${res.status})`);
    const type = res.headers.get("content-type") || "";
    if (!/audio|octet-stream/i.test(type)) throw new Error("ElevenLabs returned non-audio");
    const blob = await res.blob();
    if (!blob.size) throw new Error("ElevenLabs returned empty audio");
    const url = URL.createObjectURL(blob);
    if (!_audio) _audio = new Audio();
    _audio.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    _audio.onended = cleanup;
    _audio.onerror = cleanup;
    await _audio.play();
  } catch (_) {
    webSpeak(t);
  }
}