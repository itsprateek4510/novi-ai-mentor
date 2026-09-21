import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, esc, getDnaContext, ringColor } from "../api";
import { EmptyState, Kicker, showLoader, toast } from "../ui";

export default function CareersPage() {
  const router = useRouter();
  const [dctx, setDctx] = useState(null);
  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [savedMatches, setSavedMatches] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    showLoader(true);
    Promise.all([
      getDnaContext(),
      api("/careers?limit=50"),
      api("/careers/categories"),
      api("/careers/matches").catch(() => []),
    ])
      .then(([d, l, c, m]) => { if (alive) { setDctx(d); setList(l || []); setCategories(c || []); setSavedMatches(m || []); } })
      .catch((ex) => { if (alive) setError(ex.message); })
      .finally(() => showLoader(false));
    return () => { alive = false; };
  }, []);

  if (error) return <EmptyState title="Careers unavailable" sub={error} />;

  const matchMap = {};
  (savedMatches || []).forEach((m) => { matchMap[m.career.slug] = m.score; });

  const matchCard = (m, i) => (
    <div key={m.career.slug} className="list-item mb" style={{ cursor: "pointer" }} onClick={() => router.push(`/career/${m.career.slug}`)}>
      <div className="row">
        <div className="num-badge">{i + 1}</div>
        <div style={{ flex: 1 }}><b>{m.career.emoji} {esc(m.career.title)}</b>
          <div className="small muted">best fit for your DNA</div></div>
        <b style={{ color: ringColor(m.score) }}>{Math.round(m.score)}%</b>
      </div>
      <ul className="plain mt">{(m.reasons || []).map((r, j) => <li className="small" key={j}>{esc(r)}</li>)}</ul>
    </div>
  );

  const applyFilters = () => {
    const t = query.toLowerCase();
    return list.filter((c) => {
      const inCat = !category || c.category === category;
      const haystack = `${c.title} ${c.summary} ${c.category} ${(c.skills || []).join(" ")}`.toLowerCase();
      const inQuery = !t || haystack.includes(t);
      return inCat && inQuery;
    });
  };

  const filtered = applyFilters();

  const matchWithAI = async () => {
    showLoader(true);
    try {
      const dna = await api("/dna");
      const res = await api("/careers/match", { method: "POST", body: JSON.stringify({ interests: dna.interests, subjects: dna.subjects, skills: dna.skills }) });
      setSavedMatches(res || []);
      toast("Here are your top matches ✨");
    } catch (ex) { toast(ex.message); }
    finally { showLoader(false); }
  };

  return (
    <>
      <div className="hero"><Kicker>Explore verified paths</Kicker><h1>Career Explorer</h1><p>There are thousands of careers you've never heard of. Novi surfaces the ones that could be <b style={{ color: "var(--text)" }}>you</b>.</p></div>
      <div className="card mb">
        <div className="career-search">
          <input id="career-q" placeholder="Search careers, interests or skills — try ‘AI’, ‘design’, ‘finance’…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" id="career-match" onClick={matchWithAI}>✨ Match with AI</button>
        </div>
        <div className="cat-row">
          <button className={`cat-pill ${category === "" ? "on" : ""}`} onClick={() => setCategory("")}>All</button>
          {(categories || []).map((c) => <button key={c} className={`cat-pill ${category === c ? "on" : ""}`} onClick={() => setCategory(c)}>{c}</button>)}
        </div>
        <div id="match-result" className="mt">
          {(savedMatches || []).length ? <><div className="section-title">Your AI matches</div>{savedMatches.map(matchCard)}</> : null}
        </div>
      </div>
      <div className="career-grid" id="career-grid">
        {filtered.map((c) => (
          <div key={c.slug} className="card career-card" onClick={() => router.push(`/career/${c.slug}`)}>
            <div className="career-top">
              <div className="career-emoji">{c.emoji}</div>
              {matchMap[c.slug] !== undefined
                ? <span className="pill mid" title="AI match score">{Math.round(matchMap[c.slug])}% match</span>
                : <span className="pill" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>{esc(c.category)}</span>}
            </div>
            <div className="cc-title">{esc(c.title)}</div>
            <div className="cc-meta">{esc(c.salary_range || c.category)}</div>
            <p className="cc-summary">{esc(c.summary)}</p>
            <div className="cc-foot">
              {matchMap[c.slug] !== undefined ? <div className="progress-track"><div className="progress-fill" style={{ width: `${matchMap[c.slug]}%`, background: ringColor(matchMap[c.slug]) }} /></div> : null}
              <span className="small muted">View career →</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}