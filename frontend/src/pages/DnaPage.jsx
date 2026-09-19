import { useEffect, useState } from "react";
import { Sparkles, Zap, BookOpen, Target, Compass, Heart } from "lucide-react";
import { api, esc } from "../api";
import { EmptyState, Kicker, Pill, showLoader, toast } from "../ui";

const FIELDS = [
  ["interests", "Interests", "robotics, AI, music…"],
  ["subjects", "Subjects you enjoy", "maths, computer science…"],
  ["strengths", "Strengths", "coding, teamwork…"],
  ["development_areas", "Want to grow in", "public speaking…"],
  ["goals", "Career goals", "build an AI company"],
  ["values", "Values", "creativity, impact…"],
];

const MAP_GRID = [
  ["interests", "Interests"], ["strengths", "Strengths"], ["subjects", "Subjects"],
  ["goals", "Goals"], ["career_zones", "Career zones"], ["values", "Values"],
];

const DNA_ICONS = {
  interests: Sparkles,
  strengths: Zap,
  subjects: BookOpen,
  goals: Target,
  career_zones: Compass,
  values: Heart,
};

export default function DnaPage() {
  const [dna, setDna] = useState(null);
  const [inputs, setInputs] = useState({});
  const [error, setError] = useState(null);
  const [snaps, setSnaps] = useState([]);
  const [snapLabel, setSnapLabel] = useState("");
  const [snapNote, setSnapNote] = useState("");
  const [editingSnap, setEditingSnap] = useState(null);   // id of row in edit mode
  const [snapBusy, setSnapBusy] = useState(false);

  const load = () => api("/dna");

  useEffect(() => {
    let alive = true;
    showLoader(true);
    load()
      .then((d) => {
        if (!alive) return;
        setDna(d);
        const init = {};
        FIELDS.forEach(([k]) => { init[k] = (d[k] || []).join(", "); });
        setInputs(init);
      })
      .catch((ex) => { if (alive) setError(ex.message); })
      .finally(() => showLoader(false));
    return () => { alive = false; };
  }, []);


  const loadSnapshots = async () => {
    try { setSnaps(await api("/dna/snapshots")); }
    catch (ex) { toast(ex.message); }
  };

  useEffect(() => { loadSnapshots(); }, []);

  const saveSnapshot = async () => {
    setSnapBusy(true);
    try {
      const created = await api("/dna/snapshots", { method: "POST", body: JSON.stringify({ label: snapLabel || "My DNA · today", note: snapNote }) });
      setSnaps(created); setSnapLabel(""); setSnapNote("");
      toast("Snapshot saved \u2014 this is you, right now \u2699\ufe0f");
    } catch (ex) { toast(ex.message); }
    finally { setSnapBusy(false); }
  };

  const updateSnapshot = async (id, patch) => {
    try {
      setSnaps(await api(`/dna/snapshots/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
      setEditingSnap(null); toast("Snapshot updated");
    } catch (ex) { toast(ex.message); }
  };

  const deleteSnapshot = async (id) => {
    if (!window.confirm("Delete this snapshot forever? Older snapshots are only useful while they mean something to you.")) return;
    try { await api(`/dna/snapshots/${id}`, { method: "DELETE" }); setSnaps((s) => s.filter((x) => x.id !== id)); toast("Snapshot deleted"); }
    catch (ex) { toast(ex.message); }
  };

  const beginEdit = (s) => { setEditingSnap({ id: s.id, label: s.label || "", note: s.note || "" }); };

  if (error) return <EmptyState title="DNA unavailable" sub={error} />;
  if (!dna) return null;

  const after = async (next) => {
    const d = await load();
    setDna(d);
    const init = {};
    FIELDS.forEach(([k]) => { init[k] = (d[k] || []).join(", "); });
    setInputs(init);
    next();
  };

  const saveDna = async () => {
    const payload = {};
    FIELDS.forEach(([k]) => { payload[k] = (inputs[k] || "").split(",").map((s) => s.trim()).filter(Boolean); });
    showLoader(true);
    try { await api("/dna", { method: "PATCH", body: JSON.stringify(payload) }); toast("DNA updated ✨"); await after(() => {}); }
    catch (ex) { toast(ex.message); }
    finally { showLoader(false); }
  };

  const refreshDna = async () => {
    showLoader(true);
    try { await api("/dna/refresh", { method: "POST" }); toast("DNA refreshed from your chats 🧬"); await after(() => {}); }
    catch (ex) { toast(ex.message); }
    finally { showLoader(false); }
  };

  const reflect = async (accepted, feedback) => {
    showLoader(true);
    try { await api("/dna/reflect", { method: "POST", body: JSON.stringify(accepted ? { accepted: true } : { accepted: false, feedback }) }); await after(() => {}); }
    catch (ex) { toast(ex.message); }
    finally { showLoader(false); }
  };

  const reflNo = async () => {
    const feedback = window.prompt("What feels off? Tell Novi what's more true for you:", "");
    if (feedback === null) return;
    await reflect(false, feedback);
    toast("Got it — Novi will keep learning 🧬");
  };

  const field = (k, label, ph) => (
    <div className="field">
      <label>{label}</label>
      <input value={inputs[k] || ""} placeholder={ph} onChange={(e) => setInputs((m) => ({ ...m, [k]: e.target.value }))} />
    </div>
  );

  return (
    <>
      <div className="hero"><Kicker>Your living map</Kicker><h1>My Career DNA</h1><p>The map Novi builds about who you are. Update it, or let Novi refresh it from your chats.</p></div>
      <div className="card novi-box mb">
        <h3 className="mb">Novi's reflection</h3>
        <span className="novi-avatar">N</span><span>{dna.novi_reflection ? esc(dna.novi_reflection) : "Your reflection fills here after you chat about your interests."}</span>
        <div className="row mt">
          <button className="btn" id="refl-yes" onClick={() => { reflect(true, null); toast("That makes me happy to hear 🎉"); }}>Yes, that's me ✓</button>
          <button className="btn-ghost" id="refl-no" onClick={reflNo}>Not quite</button>
        </div>
      </div>
      {dna.dna_filled ? <Pill label="DNA ready" tone="good" /> : <span className="pill">Not yet finalised</span>}
      <div className="section-title">Edit DNA</div>
      <div className="card">
        {FIELDS.map(([k, l, ph]) => field(k, l, ph))}
        <div className="row">
          <button className="btn" id="save-dna" onClick={saveDna}>Save DNA</button>
          <button className="btn-ghost" id="refresh-dna" onClick={refreshDna}>Refresh from chats</button>
          {!dna.dna_filled ? <button className="btn-ghost" id="finalize-dna" onClick={() => { reflect(true, null); toast("DNA finalised — you're ready to match 🎯"); }}>Finalize DNA ✓</button> : <span className="chip acc">DNA locked · ready for matching</span>}
        </div>
      </div>
      <div className="section-title">Currently mapped</div>
      <div className="cols dna-map">
        {MAP_GRID.map(([k, l]) => {
          const Icon = DNA_ICONS[k] || Sparkles;
          const tags = dna[k] || [];
          return (
            <div className={`card dna-card ic-${k}`} key={k}>
              <h3><span className="dna-ico"><Icon size={18} strokeWidth={1.9} /></span>{l}<span className="dna-count">{tags.length}</span></h3>
              <div className="dna-tag-row">
                {tags.length ? tags.map((t) => <span className="chip" key={t}>{esc(t)}</span>) : <span className="muted small">Not set yet</span>}
              </div>
              {tags.length ? <div className="dna-strand" /> : null}
            </div>
          );
        })}
      </div>
      <div className="section-title">Snapshots · your DNA over the years</div>
      <div className="card mb">
        <p className="muted small mb">Progress is gradual \u2014 it unfolds across many years. Keep a snapshot for each big step: save it, come back and edit the label/note in later years, and delete the ones that no longer matter.</p>
        {!dna.dna_filled ? null : (
          <div className="row mb">
            <input value={snapLabel} onChange={(e) => setSnapLabel(e.target.value)} placeholder="Label, e.g. \u201CMy DNA at 14\u201D" />
            <input value={snapNote} onChange={(e) => setSnapNote(e.target.value)} placeholder="A note to future you (optional)" />
            <button className="btn" onClick={saveSnapshot} disabled={snapBusy}>Save snapshot \u2694</button>
          </div>
        )}
        {snaps.length === 0 ? (
          <EmptyState title="No snapshots yet" sub="Once your DNA is ready, save one to begin your timeline." />
        ) : (
          snaps.map((s) => (
            <div className="snap-card" key={s.id}>
              <div className="row between">
                <strong>{esc(s.label || "My DNA")}</strong>
                <span className="chip">{s.created_at ? new Date(s.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "now"}</span>
              </div>
              {s.note ? <p className="muted">{esc(s.note)}</p> : null}
              {s.delta ? (
                <div className="dna-tag-row mt">
                  {Object.entries(s.delta).flatMap(([k, v]) => v && v.length ? v.map((item) => (
                    <span className={"chip " + (k.endsWith("_added") ? "ac" : "warn")} key={k + item}>{esc(item)} {k.endsWith("_added") ? "\u2191" : "\u2193"}</span>
                  )) : [])}
                </div>
              ) : null}
              <div className="row between mt"></div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
