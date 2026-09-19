import { useState } from "react";
import { api, esc } from "../api";
import { showLoader, toast } from "../ui";

export default function AdvisorPage() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    const question = q.trim();
    if (!question) return;
    setBusy(true);
    showLoader(true);
    try {
      const r = await api("/parents/advisor", { method: "POST", body: JSON.stringify({ question }) });
      setAnswer(r.answer || "");
    } catch (ex) { toast(ex.message); }
    finally { setBusy(false); showLoader(false); }
  };

  return (
    <>
      <div className="hero">
        <h1>Parent Advisor</h1>
        <p>Ask Novi for calm, evidence-based guidance about your child's journey.</p>
      </div>
      <div className="card">
        <div className="field">
          <label>Ask Novi</label>
          <textarea id="adv-q" placeholder="How can I support my child around exam stress?" style={{ minHeight: 100 }} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn" disabled={busy} onClick={ask}>{busy ? "Thinking…" : "Ask Novi"}</button>
        {answer ? (
          <div id="adv-answer" className="mt">
            <div className="novi-box"><span className="novi-avatar">N</span>{esc(answer)}</div>
          </div>
        ) : null}
      </div>
    </>
  );
}