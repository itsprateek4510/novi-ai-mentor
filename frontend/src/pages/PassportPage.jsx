import { useEffect, useState } from "react";
import { api, esc, getDnaContext, PP_CATS, PP_LEVELS, PP_ORDER, prettyDate, ppGuessCat, ppLevel, ringColor } from "../api";
import { useAuth } from "../auth";
import { EmptyState, Kicker, Modal, Ring, showLoader, toast } from "../ui";

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
  const byCat = (c) => items.filter((i) => i.category === c);
  const verifiedCount = items.filter((i) => i.verified).length;
  const covered = Object.keys(comp.by_category || {}).filter((c) => (comp.by_category[c] || 0) > 0);
  const skillSet = [...new Set(items.flatMap((i) => (i.skills || []).map((s) => String(s).trim()).filter(Boolean)))];
  const dnaFocus = (dctx && (dctx.label || dctx.top_zone)) || comp.dna_focus || "";
  const headline = dnaFocus ? `${dnaFocus.toUpperCase()} PORTFOLIO` : "CAREER PORTFOLIO";
  const skillPool = skillSet.length ? skillSet.slice(0, 10) : (dctx && (dctx.skills || []).slice(0, 6)) || [];
  const score = comp.score || 0;
  const level = ppLevel(score);
  const strengthHint = comp.novi_note || level.tip;
  const suggested = comp.suggested_next || "";

  const ppEntry = (i) => {
    const c = PP_CATS[i.category] || PP_CATS.achievements;
    return (
      <div className="pp-entry" style={{ "--cat": c.rgb }} key={i.id}>
        <div className="pp-entry-top">
          <span className="pp-entry-ico">{c.icon}</span>
          <span className="pp-entry-cat">{esc(c.label)}</span>
          {i.verified ? <span className="pp-entry-verified">✓ verified</span> : null}
        </div>
        <h3 className="pp-entry-title">{esc(i.title)}</h3>
        {i.date_achieved ? <div className="pp-entry-date">📅 {prettyDate(i.date_achieved)}</div> : null}
        {i.description ? <p className="small muted pp-entry-desc">{esc(i.description)}</p> : null}
        {(i.skills || []).length ? <div className="pp-entry-skills">{(i.skills || []).map((s) => <span className="chip" key={s}>{esc(s)}</span>)}</div> : null}
        <div className="pp-entry-actions">
          <button className="pp-mini" onClick={() => setSheet({ editing: i, presetCat: null })}>✏️ Edit</button>
          <button className="pp-mini danger" onClick={async () => {
            if (!window.confirm("Remove this entry from your passport?")) return;
            try { await api(`/passport/items/${i.id}`, { method: "DELETE" }); toast("Entry removed"); const { its, c } = await load(); setItems(its); setComp(c); }
            catch (ex) { toast(ex.message, "err"); }
          }}>🗑 Delete</button>
          {i.certificate_url ? <a className="pp-mini" href={esc(i.certificate_url)} target="_blank" rel="noopener noreferrer">🔗 Proof</a> : null}
        </div>
      </div>
    );
  };

  const ppTile = (k) => {
    const c = PP_CATS[k], n = byCat(k).length;
    return (
      <div key={k} className={`pp-tile ${filter === k ? "on" : ""}`} style={{ "--cat": c.rgb }} role="button" tabIndex={0}
        onClick={() => { const next = filter === k ? "all" : k; _ppFilter = next; setFilter(next); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.querySelector(`[aria-label="${c.label}"]`)?.click(); } }}>
        <span className="pp-tile-ico">{c.icon}</span>
        <span className="pp-tile-label">{esc(c.label)}</span>
        <span className="pp-tile-tag">{esc(c.tag)}</span>
        <span className="pp-tile-count">{n}</span>
        <button className="pp-tile-plus" onClick={(e) => { e.stopPropagation(); setSheet({ editing: null, presetCat: k }); }}>+</button>
      </div>
    );
  };

  const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);

  const scrollToPassport = () => {
    document.getElementById("pp-passport")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const setFilterAndScroll = (k) => {
    _ppFilter = k;
    setFilter(k);
  };

  return (
    <>
      <section className="pp-hero">
        <div className="pp-hero-emoji">📔</div>
        <div className="pp-hero-copy">
          <Kicker>Career Passport</Kicker>
          <h1>Everything you do becomes <span className="grad">part of your story.</span></h1>
          <p>Your Career Passport is your living record of the skills, experiences and achievements you've built over time.</p>
        </div>
      </section>
      <section className="pp-level">
        <div className="pp-level-ring"><Ring pct={score} label={Math.round(score) + "%"} size={104} /></div>
        <div className="pp-level-right">
          <div className="pp-level-lab">Profile Strength</div>
          <div className="pp-level-row">
            <span className="pp-level-badge">{level.emoji} {esc(level.name)}</span>
            <span className="pp-level-score">{Math.round(score)}<small>/100</small></span>
          </div>
          <div className="pp-bar"><span style={{ width: `${Math.max(4, Math.min(100, score))}%` }} /></div>
          <p className="small muted">{esc(strengthHint)}</p>
          <div className="pp-level-stats">
            <span><b>{items.length}</b> entries</span>
            <span><b>{covered.length}</b> of 6 categories</span>
            <span><b>{skillPool.length}</b> skills</span>
          </div>
          <button className="btn pp-view" id="pp-cta" onClick={scrollToPassport}>View My Passport →</button>
        </div>
      </section>

      {suggested ? (
        <section className="pp-quest">
          <span className="pp-quest-ico">🎯</span>
          <div className="pp-quest-copy">
            <div className="pp-quest-lab">Next quest</div>
            <b>{esc(suggested)}</b>
          </div>
          <button className="btn pp-quest-btn" id="pp-quest-go" onClick={() => setSheet({ editing: null, presetCat: ppGuessCat(suggested) })}>Let's do it →</button>
        </section>
      ) : null}

      <div className="pp-sec-head"><h2>What goes in your passport</h2><span className="small muted">Tap a card to add or filter</span></div>
      <section className="pp-tiles">{PP_ORDER.map(ppTile)}</section>

      <div className="pp-sec-head" id="pp-passport">
        <h2>My entries</h2>
        <button className="btn" id="pp-add" onClick={() => setSheet({ editing: null, presetCat: filter === "all" ? "projects" : filter })}>+ Add entry</button>
      </div>

      <div className="pf-tabs">
        <button className={`cat-pill ${filter === "all" ? "on" : ""}`} onClick={() => setFilterAndScroll("all")}>🧰 All · {items.length}</button>
        {PP_ORDER.map((k) => <button key={k} className={`cat-pill ${filter === k ? "on" : ""}`} onClick={() => setFilterAndScroll(k)}>{PP_CATS[k].icon} {esc(PP_CATS[k].label)} · {byCat(k).length}</button>)}
      </div>

      <div id="pf-grid" className="pp-grid">
        {filtered.length ? filtered.map(ppEntry) : (
          <div className="pp-empty">
            <div className="pp-empty-emoji">{filter === "all" ? "🌟" : (PP_CATS[filter]?.icon || "🌟")}</div>
            <h3>No entries yet</h3>
            <p className="small muted">Add your first {filter === "all" ? "win" : PP_CATS[filter] ? PP_CATS[filter].label.toLowerCase() : "entry"} — it only takes a minute.</p>
            <button className="btn" onClick={() => setSheet({ editing: null, presetCat: filter === "all" ? "projects" : filter })}>+ Add {filter === "all" ? "an entry" : esc(PP_CATS[filter]?.label || "entry")}</button>
          </div>
        )}
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