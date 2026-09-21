import { useEffect, useState } from "react";
import { api, esc, getDnaContext, PP_CATS, PP_ORDER, prettyDate, ppGuessCat, ppLevel, ringColor } from "../api";
import { useAuth } from "../auth";
import { EmptyState, Modal, showLoader, toast } from "../ui";

let _ppFilter = "all";

export default function PassportPage() {
  const { user } = useAuth();
  const [dctx, setDctx] = useState(null);
  const [items, setItems] = useState([]);
  const [comp, setComp] = useState({ score: 0, by_category: {} });
  const [filter, setFilter] = useState(_ppFilter);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(null); // { editing: item|null, presetCat }

  const load = async () => {
    const [d, its, c] = await Promise.all([
      getDnaContext(),
      api("/passport").catch(() => []),
      api("/passport/completion").catch(() => ({ score: 0, by_category: {} })),
    ]);
    return { d, its: its || [], c: c || { score: 0, by_category: {} } };
  };

  useEffect(() => {
    let alive = true;
    showLoader(true);
    load()
      .then(({ d, its, c }) => { if (alive) { setDctx(d); setItems(its); setComp(c); } })
      .catch((ex) => { if (alive) setError(ex.message); })
      .finally(() => showLoader(false));
    return () => { alive = false; };
  }, []);

  if (error) return <EmptyState title="Passport unavailable" sub={error} />;
  if (!dctx) return null;

  const firstName = user?.first_name || user?.name || "Student";
  const lastName = user?.last_name || "";
  const initials = `${(firstName[0] || "").toUpperCase()}${(lastName[0] || "").toUpperCase()}`.trim() || "NS";
  const byCat = (c) => items.filter((i) => i.category === c);
  const verifiedCount = items.filter((i) => i.verified).length;
  const covered = Object.keys(comp.by_category || {}).filter((c) => (comp.by_category[c] || 0) > 0);
  const skillSet = [...new Set(items.flatMap((i) => (i.skills || []).map((s) => String(s).trim()).filter(Boolean)))];
  const dnaFocus = (dctx && (dctx.label || dctx.top_zone)) || comp.dna_focus || "";
  const headline = dnaFocus ? `${String(dnaFocus).toUpperCase()} PORTFOLIO` : "CAREER PORTFOLIO";
  const skillPool = skillSet.length ? skillSet.slice(0, 10) : (dctx && (dctx.skills || []).slice(0, 6)) || [];
  const score = comp.score || 0;
  const level = ppLevel(score);
  const strengthHint = comp.novi_note || level.tip;
  const suggested = comp.suggested_next || "";

  const catBars = PP_ORDER.map((k) => {
    const pct = Math.max(0, Math.min(100, (comp.by_category || {})[k] || 0));
    return { k, label: PP_CATS[k].label, pct };
  }).sort((a, b) => b.pct - a.pct);

  const openAdd = (cat) => setSheet({ editing: null, presetCat: cat || (filter === "all" ? "projects" : filter) });

  const scrollToHighlights = () => {
    document.getElementById("ln-highlights")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const setFilterAndScroll = (k) => {
    _ppFilter = k;
    setFilter(k);
    document.getElementById("ln-highlights")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const lnEntry = (i) => {
    const c = PP_CATS[i.category] || PP_CATS.achievements;
    return (
      <div className={`ln-entry${i.verified ? " ln-verified" : ""}`} key={i.id}>
        <span className="ln-entry-ico">{c.icon}</span>
        <div className="ln-entry-body">
          <div className="ln-entry-top">
            <span className="ln-entry-title">{esc(i.title)} {i.verified ? <span className="ln-badge" title="Verified">✓</span> : null}</span>
            <span className="ln-entry-actions">
              <button className="btn-ghost tiny" onClick={() => setSheet({ editing: i, presetCat: null })}>Edit</button>
              <button className="btn-ghost tiny danger" onClick={async () => {
                if (!window.confirm("Remove this entry from your passport?")) return;
                try { await api(`/passport/items/${i.id}`, { method: "DELETE" }); toast("Entry removed"); const { its, c } = await load(); setItems(its); setComp(c); }
                catch (ex) { toast(ex.message, "err"); }
              }}>Delete</button>
            </span>
          </div>
          <div className="ln-entry-meta">
            <span>{esc(c.label)}</span>
            {i.date_achieved ? <><span className="dot" /><span>📅 {prettyDate(i.date_achieved)}</span></> : null}
            {i.certificate_url ? <><span className="dot" /><a href={esc(i.certificate_url)} target="_blank" rel="noopener noreferrer">🔗 Proof</a></> : null}
          </div>
          {i.description ? <p className="ln-entry-desc">{esc(i.description)}</p> : null}
          {(i.skills || []).length ? <div className="ln-entry-skills">{(i.skills || []).map((s) => <span className="chip" key={s}>{esc(s)}</span>)}</div> : null}
        </div>
      </div>
    );
  };

  const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);

  return (
    <>
      <section className="ln-profile">
        <div className="ln-cover">
          <div className="ln-cover-bg" />
          <span className="ln-cover-tag">{esc(level.name.toUpperCase())} portfolio</span>
        </div>

        <div className="ln-avatar-wrap">
          <div className="ln-avatar"><span className="ln-avatar-initials">{esc(initials)}</span></div>
          <button className="ln-camera" aria-label="Add passport entry" onClick={() => openAdd()}>📷</button>
        </div>

        <div className="ln-head">
          <div>
            <h1 className="ln-name">{esc(firstName)} {lastName ? <span className="grad">{esc(lastName)}</span> : null}</h1>
            <div className="ln-headline">{esc(headline)}</div>
            <div className="ln-loc">
              <span>{level.emoji} {esc(level.name)}</span>
              <span className="dot" />
              <span>{esc(dnaFocus || "Career explorer")}</span>
              <span className="dot" />
              <span>{covered.length}/6 areas covered</span>
            </div>
          </div>
          <div className="ln-cta">
            <button className="btn" id="pp-add" onClick={() => openAdd()}>＋ Add entry</button>
            <button className="btn-ghost ln-refresh" onClick={scrollToHighlights}>View highlights</button>
          </div>
        </div>

        <div className="ln-stats">
          <div className="ln-stat"><b>{items.length}</b><span>entries</span></div>
          <div className="ln-stat"><b>{covered.length}</b><span>of 6 areas</span></div>
          <div className="ln-stat"><b>{skillPool.length}</b><span>skills</span></div>
          <div className="ln-stat"><b>{verifiedCount}</b><span>verified</span></div>
          <div className="ln-score-cell">
            <div className="ln-score-label">Profile strength</div>
            <b style={{ color: ringColor(score) }}>{Math.round(score)}%</b>
            <div className="ln-bar" style={{ width: "100%" }}><div className={`ln-bar-fill${score ? " has" : ""}`} style={{ width: `${Math.max(4, Math.min(100, score))}%` }} /></div>
          </div>
        </div>
      </section>

      <div className="ln-grid">
        <div className="ln-main">
          <section className="ln-section">
            <div className="ln-section-head" id="ln-highlights">
              <h2 className="ln-section-title">Highlights</h2>
              <div className="pf-tabs">
                <button className={`cat-pill ${filter === "all" ? "on" : ""}`} onClick={() => setFilterAndScroll("all")}>🧰 All · {items.length}</button>
                {PP_ORDER.map((k) => <button key={k} className={`cat-pill ${filter === k ? "on" : ""}`} onClick={() => setFilterAndScroll(k)}>{PP_CATS[k].icon} {esc(PP_CATS[k].label)} · {byCat(k).length}</button>)}
              </div>
            </div>

            <div className="ln-feed">
              {filtered.length ? filtered.map(lnEntry) : (
                <div className="ln-empty">
                  <div className="ln-empty-ico">{filter === "all" ? "🌟" : (PP_CATS[filter]?.icon || "🌟")}</div>
                  <h3>No {filter === "all" ? "entries here yet" : `${(PP_CATS[filter]?.label || "entry").toLowerCase()} here yet`}</h3>
                  <p className="small muted">Add your first {filter === "all" ? "win" : (PP_CATS[filter]?.label.toLowerCase() || "entry")} — it only takes a minute.</p>
                  <button className="btn" onClick={() => openAdd(filter)}>＋ Add {filter === "all" ? "an entry" : esc(PP_CATS[filter]?.label || "entry")}</button>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="ln-rail">
          <div className="card ln-card">
            <div className="ln-card-head"><span className="ln-ico">🧭</span><h3>Novi's focus</h3></div>
            <div className="ln-focus">
              <span className="chip" style={{ alignSelf: "flex-start", maxWidth: "100%" }}>{esc(dnaFocus || "Broadening horizons")}</span>
              <p className="small muted" style={{ margin: 0 }}>{esc(comp.novi_note || strengthHint)}</p>
            </div>
          </div>

          <div className="card ln-card">
            <div className="ln-card-head"><span className="ln-ico">🛠️</span><h3>Skills</h3></div>
            {skillPool.length ? (
              <div className="ln-entry-skills">{skillPool.map((s) => <span className="chip" key={s}>{esc(String(s))}</span>)}</div>
            ) : <p className="small muted" style={{ margin: 0 }}>Your skills show up here as you add wins.</p>}
          </div>

          {suggested ? (
            <div className="card ln-card">
              <div className="ln-card-head"><span className="ln-ico">🎯</span><h3>Next quest</h3></div>
              <div className="ln-next"><span className="ln-ico">⭐</span><span className="small"><b style={{ color: "var(--accent-2)" }}>{esc(suggested)}</b></span></div>
              <button className="btn" id="pp-quest-go" onClick={() => setSheet({ editing: null, presetCat: ppGuessCat(suggested) })}>Let's do it →</button>
            </div>
          ) : null}

          <div className="card ln-card">
            <div className="ln-card-head"><span className="ln-ico">📈</span><h3>Area coverage</h3></div>
            {catBars.map((r) => (
              <div key={r.k} className="ln-bar-row">
                <span>{esc(r.label)}</span>
                <div className="ln-bar"><div className={`ln-bar-fill${r.pct ? " has" : ""}`} style={{ width: `${Math.max(3, r.pct)}%` }} /></div>
                <b>{Math.round(r.pct)}%</b>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {sheet ? <PassportSheet initialEdit={sheet.editing} presetCat={sheet.presetCat} onClose={() => setSheet(null)} onSaved={async () => { const { its, c } = await load(); setItems(its); setComp(c); }} /> : null}
    </>
  );
}

function PassportSheet({ initialEdit, presetCat, onClose, onSaved }) {
  const editing = initialEdit;
  const [picked, setPicked] = useState(editing ? editing.category : (presetCat || "projects"));
  const [title, setTitle] = useState(editing?.title || "");
  const [desc, setDesc] = useState(editing?.description || "");
  const [date, setDate] = useState(editing?.date_achieved || "");
  const [skills, setSkills] = useState((editing?.skills || []).join(", "));
  const [used, setUsed] = useState([]);

  const suggestions = [...new Set([...(editing?.skills || []).map(String), ...["python", "teamwork", "leadership", "design", "public speaking", "data analysis", "writing", "robotics"]])].slice(0, 8);

  const toggleSug = (v) => {
    const list = skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (!list.some((s) => s.toLowerCase() === v.toLowerCase())) {
      list.push(v);
      setSkills(list.join(", "));
      setUsed((u) => [...u, v]);
    }
  };

  const save = async () => {
    const payload = {
      category: picked,
      title: title.trim(),
      description: desc.trim(),
      date_achieved: date || null,
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
    };
    if (!payload.title) { toast("Give it a title first", "err"); return; }
    showLoader(true);
    try {
      if (editing) { await api(`/passport/items/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) }); toast("Saved ✓"); }
      else { await api("/passport/items", { method: "POST", body: JSON.stringify(payload) }); toast("Nice one — added ✨"); }
      onClose();
      await onSaved();
    } catch (ex) { toast(ex.message, "err"); }
    showLoader(false);
  };

  return (
    <Modal onClose={onClose} cls="sheet">
      <div className="sheet-head">
        <h2>{editing ? "✏️ Edit entry" : "✨ Add to your passport"}</h2>
        <button className="sheet-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="sheet-body">
        <div className="sheet-lab">Pick a category</div>
        <div className="pp-pick" id="pp-pick">
          {PP_ORDER.map((k) => <button key={k} type="button" className={`pp-pick-btn ${k === picked ? "on" : ""}`} style={{ "--cat": PP_CATS[k].rgb }} onClick={() => setPicked(k)}><span>{PP_CATS[k].icon}</span>{esc(PP_CATS[k].label)}</button>)}
        </div>
        <div className="sheet-lab">What did you do?</div>
        <input id="pp-title" className="sheet-input" placeholder="e.g. Built my first game" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <div className="sheet-lab">Tell the story <span className="opt">(optional)</span></div>
        <textarea id="pp-desc" className="sheet-input" rows="3" placeholder="What did you make? What was tricky about it?" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="sheet-2col">
          <div><div className="sheet-lab">When?</div><input id="pp-date" type="date" className="sheet-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><div className="sheet-lab">Skills <span className="opt">(comma separated)</span></div><input id="pp-skills" className="sheet-input" placeholder="python, teamwork" value={skills} onChange={(e) => setSkills(e.target.value)} /></div>
        </div>
        <div className="sheet-lab">Tap to add skills</div>
        <div className="pp-sug" id="pp-sug">
          {suggestions.map((s) => <button key={s} type="button" className={`pp-sug-chip${used.includes(s) ? " used" : ""}`} onClick={() => toggleSug(s)}>+ {esc(s)}</button>)}
        </div>
      </div>
      <div className="sheet-foot"><button className="btn sheet-save" id="pp-save" onClick={save}>{editing ? "Save changes ✓" : "Add to passport ✨"}</button></div>
    </Modal>
  );
}