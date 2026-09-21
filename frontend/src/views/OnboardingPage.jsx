"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Mic, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { api, API, getApiToken, initials } from "../api";
import { useAuth } from "../auth";
import { toast } from "../ui";
import { stopAll, webSpeak } from "../speech";

const GREETING =
  "Hi, I'm Novi 👋\n\nBefore I start helping you, I want to get to know you.\nThere are no right or wrong answers. You don't need to know what you want to become.\nJust be yourself — I'll figure out the rest.";

const WELCOME_PATH = "https://novi.socratic.school";

export default function OnboardingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const logRef = useRef(null);
  const audioRef = useRef(null);
  const speakCtl = useRef(null);
  const micRef = useRef({ recorder: null, chunks: [], stream: null, cancelled: false });
  const micHold = useRef(false);

  const firstName = user?.first_name?.split(" ")[0] || "there";

  const apply = useCallback((res) => {
    setFlow(res);
    if (res && res.error) toast(res.error, "err");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let state = await api("/onboarding/flow");
      if (!state.started) state = await api("/onboarding/flow/start", { method: "POST", body: "{}" });
      apply(state);
    } catch (ex) {
      toast(ex.message, "err");
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    load();
  }, [load]);

  // keep the conversation scrolled to the latest message
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [flow?.transcript?.length, loading, busy]);

  useEffect(() => {
    setSelected([]);
    setDraft("");
  }, [flow?.current?.id]);

  useEffect(() => () => stopAll(), []);

  const submit = useCallback(
    async (body) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await api("/onboarding/flow/answer", {
          method: "POST",
          body: JSON.stringify(body),
        });
        apply(res);
      } catch (ex) {
        toast(ex.message, "err");
      } finally {
        setBusy(false);
      }
    },
    [busy, apply],
  );

  const skip = useCallback(async () => {
    if (busy || !flow?.current) return;
    setBusy(true);
    try {
      const res = await api("/onboarding/flow/skip", {
        method: "POST",
        body: JSON.stringify({ step_id: flow.current.id }),
      });
      apply(res);
    } catch (ex) {
      toast(ex.message, "err");
    } finally {
      setBusy(false);
    }
  }, [busy, flow, apply]);

  // ---- voice: playback (ElevenLabs, fallback to browser speechSynthesis) ----
  const playQuestion = useCallback(
    async (text) => {
      if (!voiceOn || !text) return;
      speakCtl.current?.abort();
      const ctl = new AbortController();
      speakCtl.current = ctl;
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      try {
        const res = await fetch(`${API}/onboarding/voice/speak`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(getApiToken() ? { Authorization: `Bearer ${getApiToken()}` } : {}),
          },
          body: JSON.stringify({ text }),
          signal: ctl.signal,
        });
        if (!res.ok) throw new Error(`voice unavailable (${res.status})`);
        if (!/audio|octet-stream/i.test(res.headers.get("content-type") || "")) throw new Error("voice returned non-audio");
        const blob = await res.blob();
        if (!blob.size) throw new Error("voice returned empty audio");
        const el = audioRef.current;
        if (!el) throw new Error("no audio element");
        const url = URL.createObjectURL(blob);
        el.onended = () => URL.revokeObjectURL(url);
        el.onerror = () => URL.revokeObjectURL(url);
        el.src = url;
        await el.play();
      } catch (err) {
        if (err && err.name === "AbortError") return;
        if (!ctl.signal.aborted) {
          toast("Voice playback unavailable", "err");
          webSpeak(text);
        }
      } finally {
        if (speakCtl.current === ctl) speakCtl.current = null;
      }
    },
    [voiceOn],
  );

  // Speak the current question whenever voice mode is on and it changes.
  useEffect(() => {
    if (voiceOn && flow?.current?.question) playQuestion(flow.current.question);
  }, [voiceOn, flow?.current?.id, playQuestion]);

  // Turning voice off (or unmounting) cuts playback, in-flight speak and mic.
  useEffect(() => {
    if (!voiceOn) {
      speakCtl.current?.abort();
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
    }
  }, [voiceOn]);

  useEffect(
    () => () => {
      speakCtl.current?.abort();
      audioRef.current?.pause();
      if (micRef.current.recorder) micRef.current.recorder.state !== "inactive" && micRef.current.recorder.stop();
      micRef.current.stream?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  // ---- voice: mic input (hold-to-talk; barge-in) ----
  const transcribeVoice = async (blob) => {
    const fd = new FormData();
    fd.append("file", blob, "voice.webm");
    const res = await fetch(`${API}/onboarding/voice/transcribe`, {
      method: "POST",
      headers: getApiToken() ? { Authorization: `Bearer ${getApiToken()}` } : {},
      body: fd,
    });
    if (!res.ok) throw new Error("Transcription failed");
    const data = await res.json();
    return (data && data.text ? data.text : "").trim();
  };

  const submitVoice = useCallback(
    async (transcript) => {
      if (!flow?.current) return;
      const res = await api("/onboarding/voice/answer", {
        method: "POST",
        body: JSON.stringify({ step_id: flow.current.id, transcript }),
      });
      if (res && res.resolved === true) {
        apply(res);
      } else if (res) {
        toast(res.error || "I couldn't understand that — try again", "err");
      } else {
        throw new Error("No response from voice answer");
      }
    },
    [flow, apply],
  );

  const beginMic = useCallback(async () => {
    if (busy || recording || micHold.current) return;
    micHold.current = true;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    speakCtl.current?.abort();
    speakCtl.current = null;
    setRecording(true);
    micRef.current = { recorder: null, chunks: [], stream: null, cancelled: false };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (micRef.current.cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        micHold.current = false;
        return;
      }
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        setRecording(false);
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const text = await transcribeVoice(blob);
          if (text) await submitVoice(text);
          else toast("I couldn't hear that — try again", "err");
        } catch (err) {
          toast(err.message || "Voice failed — try again or type instead", "err");
        }
      };
      recorder.onerror = (e) => {
        toast(e && e.error && e.error.message ? e.error.message : "Recording failed", "err");
        setRecording(false);
      };
      micRef.current.stream = stream;
      micRef.current.recorder = recorder;
      recorder.start();
    } catch (err) {
      const name = err && err.name;
      toast(
        name === "NotAllowedError" || name === "NotFoundError"
          ? "Microphone unavailable"
          : "Couldn't start microphone",
        "err",
      );
      setRecording(false);
      micHold.current = false;
    }
  }, [busy, recording, submitVoice]);

  const endMic = useCallback(() => {
    const { recorder, stream } = micRef.current;
    micHold.current = false;
    micRef.current.cancelled = true;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    micRef.current = { recorder: null, chunks: [], stream: null, cancelled: false };
    if (!recorder) setRecording(false);
  }, []);

  if (loading) {
    return (
      <div className="chat-shell">
        <div className="chat-main ob-loading">
          <Loader2 size={22} className="spin" />
        </div>
      </div>
    );
  }

  if (flow?.done) return <Reveal flow={flow} firstName={firstName} />;

  const cur = flow?.current;
  const transcript = flow?.transcript || [];
  const percent = flow?.percent ?? 0;
  const fresh = transcript.length === 0;
  const kind = cur?.kind || "free";
  const isMulti = kind === "multi";
  const isSingle = kind === "single";
  const selectedSafe = selected;

  const sendFree = () => {
    if (!draft.trim()) return;
    submit({ step_id: cur.id, answer: draft.trim() });
  };

  const pickSingle = (opt) => submit({ step_id: cur.id, answer: opt });
  const toggleMulti = (opt) => {
    if (selectedSafe.includes(opt)) {
      setSelected(selectedSafe.filter((o) => o !== opt));
    } else if (!cur.max_select || selectedSafe.length < cur.max_select) {
      setSelected([...selectedSafe, opt]);
    } else if (cur.max_select) {
      toast(`Pick up to ${cur.max_select}`, "err");
    }
  };
  const confirmMulti = () => {
    if (!selectedSafe.length) return;
    submit({ step_id: cur.id, values: selectedSafe, answer: selectedSafe.join(", ") });
  };

  return (
    <div className="chat-shell">
      <section className="chat-main ob-main">
        <header className="chat-head">
          <div className="chat-avatar" aria-hidden="true">N</div>
          <div className="chat-head-info">
            <div className="chat-head-name">Get to know you</div>
            <div className="chat-head-status">
              <span className="chat-dot" aria-hidden="true" />
              {cur?.section || "Novi is listening"}
            </div>
          </div>
          <div className="chat-head-actions">
            <button
              type="button"
              className={`chat-head-btn${voiceOn ? " on" : ""}`}
              onClick={() => setVoiceOn((v) => !v)}
              title={voiceOn ? "Turn voice off" : "Turn voice on"}
              aria-pressed={voiceOn}
            >
              {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
              Voice
            </button>
          </div>
          <div className="ob-progress-wrap" aria-label={`${percent}% complete`}>
            <div className="ob-progress-track">
              <div className="ob-progress-bar" style={{ width: `${percent}%` }} />
            </div>
            <span className="ob-progress-label">{percent}%</span>
          </div>
        </header>

        <div className="chat-log ob-log" ref={logRef} role="log" aria-live="polite">
          {fresh ? (
            <div className="chat-row novi">
              <div className="chat-avatar" aria-hidden="true">N</div>
              <div className="chat-stack">
                <div className="chat-bubble ob-greeting">{GREETING}</div>
              </div>
            </div>
          ) : null}

          {transcript.map((m, i) => {
            const mine = m.role === "user";
            return (
              <div className={`chat-row ${mine ? "user" : "novi"}`} key={`t-${i}`}>
                <div className="chat-avatar" aria-hidden="true">
                  {mine ? initials(user?.first_name || "You") : "N"}
                </div>
                <div className="chat-stack">
                  <div className={`chat-bubble${m.skipped ? " ob-skipped" : ""}`}>{m.content}</div>
                </div>
              </div>
            );
          })}

          {cur ? (
            <div className="chat-row novi">
              <div className="chat-avatar" aria-hidden="true">N</div>
              <div className="chat-stack">
                <div className="chat-bubble">{cur.question}</div>
              </div>
            </div>
          ) : null}

          {busy ? (
            <div className="chat-row novi">
              <div className="chat-avatar" aria-hidden="true">N</div>
              <div className="chat-stack">
                <div className="chat-bubble">
                  <span className="chat-typing" aria-label="Novi is thinking">
                    <i /><i /><i />
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <audio ref={audioRef} hidden />

        <div className="ob-composer">
          {voiceOn && cur ? (
            <div className="ob-voicebar">
              <button
                type="button"
                className={`ob-mic${recording ? " rec" : ""}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  beginMic();
                }}
                onPointerUp={() => endMic()}
                onPointerCancel={() => endMic()}
                onPointerLeave={() => {
                  if (recording) endMic();
                }}
                onContextMenu={(e) => e.preventDefault()}
                disabled={busy}
                title={recording ? "Release to stop and transcribe" : "Hold to talk"}
                aria-label="Hold to talk"
              >
                {recording ? <Loader2 size={18} className="spin" /> : <Mic size={18} />}
              </button>
              <span className="ob-hint">
                {recording ? "Listening… release to transcribe" : "Hold to talk"}
              </span>
            </div>
          ) : null}
          {isMulti ? (
            <MultiPicker
              cur={cur}
              selected={selectedSafe}
              toggle={toggleMulti}
              confirm={confirmMulti}
              busy={busy}
            />
          ) : isSingle ? (
            <SinglePicker cur={cur} pick={pickSingle} busy={busy} />
          ) : (
            <FreeComposer
              cur={cur}
              draft={draft}
              setDraft={setDraft}
              send={sendFree}
              skip={skip}
              busy={busy}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function SinglePicker({ cur, pick, busy }) {
  return (
    <>
      {cur.hint && <div className="ob-hint ob-hint-top">{cur.hint}</div>}
      <div className="ob-chips">
        {cur.options.map((opt, i) => (
          <button
            type="button"
            key={i}
            className="ob-chip"
            onClick={() => pick(opt)}
            disabled={busy}
          >
            <span className="ob-chip-box" />
            <span>{opt}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function MultiPicker({ cur, selected, toggle, confirm, busy }) {
  return (
    <>
      <div className="ob-chips">
        {cur.options.map((opt, i) => {
          const on = selected.includes(opt);
          return (
            <button
              type="button"
              key={i}
              className={`ob-chip${on ? " on" : ""}`}
              onClick={() => toggle(opt)}
              disabled={busy}
            >
              {on ? <Check size={14} /> : <span className="ob-chip-box" />}
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
      <div className="ob-chips-foot">
        <span className="ob-hint">
          {cur.max_select
            ? `${selected.length}/${cur.max_select} selected`
            : `${selected.length} selected`}
        </span>
        <button
          type="button"
          className="ob-continue"
          disabled={!selected.length || busy}
          onClick={confirm}
        >
          {busy ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <>
              Continue <ArrowRight size={15} />
            </>
          )}
        </button>
      </div>
    </>
  );
}

function FreeComposer({ cur, draft, setDraft, send, skip, busy }) {
  return (
    <>
      {cur.hint && !draft && <div className="ob-hint ob-hint-top">{cur.hint}</div>}
      <div className="chat-composer-inner ob-free-row">
        <textarea
          className="chat-textarea"
          rows={1}
          placeholder="Type your answer…"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          aria-label="Your answer"
          autoFocus
        />
        <button
          type="button"
          className="chat-send"
          onClick={send}
          disabled={!draft.trim() || busy}
          aria-label="Send answer"
          title="Send"
        >
          {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
        </button>
      </div>
      {cur.optional ? (
        <button type="button" className="ob-skip" onClick={skip} disabled={busy}>
          <X size={13} /> Skip this one
        </button>
      ) : null}
    </>
  );
}

function Reveal({ flow, firstName }) {
  const s = flow.summary || {};
  const rec = s.recommendations || {};
  const plan = s.plan_30 || [];
  const name = firstName === "there" ? "" : `${firstName}, `;
  return (
    <div className="chat-shell">
      <section className="chat-main ob-main">
        <div className="ob-reveal">
          <div className="ob-reveal-hero">
            <span className="ob-reveal-mark" aria-hidden="true">
              <Sparkles size={22} />
            </span>
            <h2 className="ob-reveal-title">
              Okay… I think I'm starting to get {name}you.
            </h2>
            {s.identity ? <p className="ob-reveal-sub">Your Novi profile · {s.identity}</p> : null}
          </div>

          {s.reflection ? <div className="ob-reveal-msg">{s.reflection}</div> : null}

          <div className="ob-reveal-card">
            <div className="ob-reveal-label">Your strongest traits</div>
            <div className="ob-chiprow">
              {(s.traits || []).map((t) => (
                <span className="ob-pill" key={t}>{t}</span>
              ))}
            </div>
          </div>

          {s.explore?.length ? (
            <div className="ob-reveal-card">
              <div className="ob-reveal-label">You may enjoy exploring</div>
              <div className="ob-chiprow">
                {(s.explore || []).map((t) => (
                  <span className="ob-pill ob-pill-accent" key={t}>{t}</span>
                ))}
              </div>
            </div>
          ) : null}

          {s.focus ? (
            <div className="ob-reveal-focus">
              <span className="ob-reveal-label">Your current focus</span>
              <span className="ob-focus">{s.focus}</span>
            </div>
          ) : null}

          {rec.careers?.length ? (
            <div className="ob-reveal-card">
              <div className="ob-reveal-label">Careers worth a look</div>
              <div className="ob-recs">
                {rec.careers.map((c) => (
                  <div className="ob-rec" key={c}>
                    <ArrowRight size={14} />
                    {c}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {rec.experiences?.length ? (
            <div className="ob-reveal-card">
              <div className="ob-reveal-label">Things to try next</div>
              <div className="ob-recs">
                {rec.experiences.map((c) => (
                  <div className="ob-rec ob-rec-soft" key={c}>
                    <Sparkles size={13} />
                    {c}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {plan.length ? (
            <div className="ob-reveal-card">
              <div className="ob-reveal-label">Your first 30 days</div>
              <ol className="ob-plan">
                {plan.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="ob-reveal-cta">
            <Link href="/dashboard" className="ob-btn ob-btn-primary">
              Continue to your dashboard <ArrowRight size={16} />
            </Link>
            <Link href="/chat" className="ob-btn">
              Chat with Novi
            </Link>
            <a href={WELCOME_PATH} className="ob-btn">
              See what you can build <Sparkles size={14} />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}