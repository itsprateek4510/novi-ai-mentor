import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, bellTime, esc, ringColor } from "../api";
import { useAuth } from "../auth";
import { Bar, EmptyState, showLoader, toast } from "../ui";

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    showLoader(true);
    api("/dashboard")
      .then((d) => { if (alive) setData(d); })
      .catch((ex) => { if (alive) setError(ex.message); })
      .finally(() => showLoader(false));
    return () => { alive = false; };
  }, []);

  if (error) return <EmptyState title="Could not load dashboard" sub={error} />;
  if (!data) return null;

  const p = data.progress || {};
  const firstName = (user?.first_name || user?.name || "there").trim().split(/\s+/)[0];
  const greeting = `Good ${bellTime()}, ${firstName} 👋`;
  const focus = data.today_focus || null;
  const dir = p.career_direction || "Exploring";
  const dirTone = dir === "On Track" ? "good" : dir === "Exploring" ? "warn" : "bad";
  const num = (v) => (typeof v === "number" ? Math.round(v) : typeof v === "string" && !isNaN(Number(v)) ? Math.round(Number(v)) : 0);
  const prof = num(p.profile_strength), uni = num(p.university_readiness), rm = num(p.roadmap_progress);
  const prioOpen = (data.priorities || []).filter((x) => !x.completed);
  const doAction = data.next_task ? { kind: "task", id: data.next_task.id } : prioOpen[0] ? { kind: "priority", id: prioOpen[0].id } : null;

  const dna = data.dna || {};
  const skills = dna.skills || [];
  const focusAreas = skills.length || (dna.interests || []).length;
  const prioWeek = (data.priorities || []).slice().sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));
  const queue = (data.roadmap_items || []).filter((x) => !x.completed).slice(0, 4);
  const recent = (data.passport || []).slice(0, 3);
  const grade = user?.grade ? `CBSE · Grade ${user.grade}` : "Your workspace";
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const go = (route) => () => navigate(`/${route}`);

  const tile = (route, ico, label, valueHTML, foot) => (
    <button className="dash-tile" onClick={go(route)}>
      <div className="dash-tile-top"><span className="dash-tile-ico">{ico}</span><span className="dash-tile-label">{label}</span></div>
      <div className="dash-tile-val">{valueHTML}</div>
      {foot || null}
    </button>
  );

  const row = (title, meta, route) => (
    <button className="dash-row" onClick={go(route)}>
      <span className="dash-row-dot"></span>
      <span className="dash-row-body">
        <span className="dash-row-title">{title}</span>
        {meta ? <span className="dash-row-meta">{meta}</span> : null}
      </span>
      <span className="dash-row-arrow">→</span>
    </button>
  );

  const sigRow = (label, v, href) => (
    <Link className="sig-row" to={href} key={label}>
      <span className="sig-label">{label}</span>
      <span className="sig-mid"><Bar v={v} /></span>
      <span className="sig-val">{v}%</span>
    </Link>
  );

  const handleDone = async () => {
    if (!doAction) return;
    showLoader(true);
    try {
      if (doAction.kind === "task") await api(`/roadmap/tasks/${doAction.id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
      else await api(`/roadmap/priorities/${doAction.id}`, { method: "PATCH" });
      toast("Nice work — knocked it out ✓");
      const d = await api("/dashboard");
      setData(d);
    } catch (ex) { toast(ex.message); }
    finally { showLoader(false); }
  };

  return (
    <div className="dash-wrap">
      <div className="dash-top">
        <div>
          <div className="dash-kick">Today · {todayLabel}</div>
          <h1 className="dash-hi">{greeting}</h1>
          <p className="dash-sub">{esc(data.novi_says || "Your workspace is ready — here's your plan.")}</p>
          <div className="dash-chips">
            <span className="chip-soft">{grade}</span>
            <span className={`pill ${dirTone}`}>{dir}</span>
          </div>
        </div>
        <button className="btn-ghost hero-chat" id="dash-chat" onClick={go("chat")}>💬 Ask Novi</button>
      </div>

      <section className="focus-card dash-hero-card">
        <div className="focus-top">
          <span className="focus-lab">Next up</span>
          <span className="dash-ring">{rm}% <i>done</i></span>
        </div>
        <h2 className="focus-title">{focus ? focus.title : "Choose your next move"}</h2>
        {focus && focus.why
          ? <div className="focus-why"><span className="fw-label">Why?</span><p>{focus.why}</p></div>
          : <p className="dash-hero-sub">Complete one focused session and Novi turns it into your next precise step.</p>}
        <div className="dash-hero-actions">
          <button className="btn" id="focus-start" onClick={go("roadmap")}>Start focused practice →</button>
          <button className="btn-ghost" id="focus-chat" onClick={go("chat")}>Ask the tutor</button>
          {doAction ? <button className="btn-ghost" id="focus-done" onClick={handleDone}>✓ Done</button> : null}
        </div>
      </section>

      <div className="dash-tiles">
        {tile("roadmap", "📌", "Open today", <span>{prioOpen.length}</span>, <div className="dash-tile-sub">priorities this week</div>)}
        {tile("dna", "🧭", "Focus areas", <span>{focusAreas}</span>, <div className="dash-tile-sub">from your DNA</div>)}
        {tile("passport", "🛡️", "Profile Strength", <span style={{ color: ringColor(prof) }}>{prof}%</span>, <Bar v={prof} />)}
        {tile("universities", "🎓", "University Readiness", <span style={{ color: ringColor(uni) }}>{uni}%</span>, <Bar v={uni} />)}
      </div>

      <div className="dash-cols">
        <section className="card dash-panel">
          <div className="between">
            <div><div className="sec-kick">Today</div><h2>Your plan.</h2></div>
            <Link to="/roadmap" className="small" style={{ color: "var(--accent)" }}>+ Add task</Link>
          </div>
          {prioWeek.length
            ? <div className="dash-rows">{prioWeek.map((x) => row(x.title, `${x.skill_category || "Priority"}${x.minutes ? ` · ${x.minutes} min` : ""}${x.completed ? " · done" : ""}`, "roadmap"))}</div>
            : <p className="small mt">Nothing is scheduled for today.</p>}
          <button className="btn-ghost dash-panel-cta" id="open-roadmap" onClick={go("roadmap")}>Open full roadmap →</button>
        </section>

        <section className="card dash-panel dash-signal">
          <div className="between">
            <div><div className="sec-kick">Progress</div><h2>Your learning signal.</h2></div>
            <Link to="/passport" className="small" style={{ color: "var(--accent)" }}>Full analysis →</Link>
          </div>
          <div className="sig-rows">
            {sigRow("Profile", prof, "/passport")}
            {sigRow("University", uni, "/universities")}
            {sigRow("Roadmap", rm, "/roadmap")}
          </div>
        </section>
      </div>

      <div className="dash-cols">
        <section className="card dash-panel">
          <div className="between"><div><div className="sec-kick">Queue</div><h2>Open work.</h2></div></div>
          {queue.length
            ? <div className="dash-rows">{queue.map((x) => row(x.title, x.category || "Task", "roadmap"))}</div>
            : <p className="small mt">Your queue is clear.</p>}
        </section>

        <section className="card dash-panel">
          <div className="between"><div><div className="sec-kick">Recent</div><h2>Pick up where you left off.</h2></div><Link to="/passport" className="small" style={{ color: "var(--accent)" }}>All →</Link></div>
          {recent.length
            ? <div className="dash-rows">{recent.map((x) => row(x.title, `${x.category || "Entry"}${x.verified ? " · verified" : ""}`, "passport"))}</div>
            : <p className="small mt">No recent activity yet — add your first passport entry.</p>}
        </section>
      </div>

      <button className="fab" id="dash-fab" title="Chat with Novi" onClick={go("chat")}>💬 <span>Novi</span></button>
    </div>
  );
}