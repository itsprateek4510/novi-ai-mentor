/* NOVI — student & parent SPA */
"use strict";

const API = "/api/v1";
const state = { token: (() => { const t = localStorage.getItem("novi_token"); return t && t !== "undefined" ? t : null; })(), user: (() => { try { const u = JSON.parse(localStorage.getItem("novi_user") || "null"); return u && typeof u === "object" ? u : null; } catch { return null; } })() },
      view = document.getElementById("view"),
      loader = document.getElementById("loader"),
      appEl = document.getElementById("app"),
      topbar = document.getElementById("topbar"),
      nav = document.getElementById("nav"),
      showLoader = (b) => loader.classList.toggle("hidden", !b);

/* ---------------------------------------------------------------- helpers */
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(API + path, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) { const msg = data && data.detail ? data.detail : `Request failed (${res.status})`; throw new Error(msg); }
  return data;
}

const star = (n) => "★".repeat(n) + "☆".repeat(5 - n);
const pill = (label, tone) => `<span class="pill ${tone}">${label}</span>`;
const MOODS = { great: "😄", good: "🙂", okay: "😕", low: "😞" };
const moodIcon = (m) => MOODS[m] || "🙂";
function ringColor(v) { return v >= 70 ? "var(--good)" : v >= 40 ? "var(--warn)" : "var(--bad)"; }
function emptyState(title, sub = "") { return `<div class="card"><h3>${esc(title)}</h3>${sub ? `<p class="mt small">${sub}</p>` : ""}</div>`; }
function kicker(text) { return `<div class="kicker">${esc(text)}</div>`; }
function bellTime() { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; }
function initials(name) {
  const p = String(name || "NOVI").trim().split(/\s+/).filter(Boolean);
  return (p[0]?.[0] || "N").toUpperCase() + (p[1]?.[0] || "").toUpperCase();
}

/* ring chart (svg donut) */
function ringHTML(pct, label = "", size = 56) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return `<div class="ring-w" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#ringGrad)" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" style="transition:stroke-dashoffset .8s cubic-bezier(.16,1,.3,1)"/>
      <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8b6cff"/><stop offset="1" stop-color="#4ac7f0"/>
      </linearGradient></defs>
    </svg>
    <span class="ring-val" style="color:${ringColor(pct)}">${label || Math.round(pct) + "%"}</span>
  </div>`;
}

/* ---------------------------------------------------------------- toasts */
let _toastWrap = null;
function toast(msg, tone = "ok") {
  if (!_toastWrap) { _toastWrap = document.createElement("div"); _toastWrap.className = "toasts"; document.body.appendChild(_toastWrap); }
  const icons = { ok: "✓", err: "⚠", info: "✦" };
  const el = document.createElement("div");
  el.className = `toast ${tone}`;
  el.innerHTML = `<span class="t-ico">${icons[tone] || icons.ok}</span><span>${esc(msg)}</span>`;
  _toastWrap.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, 2800);
}

/* ---------------------------------------------------------------- view entrance */
function enterView() {
  view.classList.remove("loaded");
  void view.offsetWidth;
  view.classList.add("loaded");
}

/* ---------------------------------------------------------------- DNA context bar
   A professional, always-present reminder that Careers / Universities / Roadmap /
   Passport / Check-in are grounded in the student's Career DNA. */
let _dnaCtx = null;
async function getDnaContext() {
  try { _dnaCtx = await api("/dna/context"); } catch (_) { _dnaCtx = { filled: false }; }
  return _dnaCtx;
}

/* ---------------------------------------------------------------- auth flow */
async function init() {
  if (!state.token) { renderAuth(); return; }
  try {
    const me = await api("/auth/me");
    state.user = me;
    localStorage.setItem("novi_user", JSON.stringify(state.user));
  } catch (_) { logout(); return; }
  renderShell();
  dispatch();
}

function logout() {
  state.token = null; state.user = null;
  localStorage.removeItem("novi_token"); localStorage.removeItem("novi_user");
  renderAuth();
}

function renderAuth() {
  topbar.classList.add("hidden");
  appEl.classList.add("logged-out");
  const [loginErr, signupErr] = [state._loginErr || "", state._signupErr || ""];
  delete state._loginErr; delete state._signupErr;
  const field = (name, label, ph, type = "text", extra = "") => `
    <div class="field"><label>${label}</label><input name="${name}" type="${type}" placeholder="${ph}" ${extra}></div>`;
  view.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-panel">
        <div class="auth-hero">
          <div class="brand-mark">N</div>
          <h1>Your AI mentor.<br>Your journey.<br>Your future.</h1>
          <p>The Operating System for Student Success — guiding you from Grade 9 to your dream university.</p>
        </div>

        <div class="card">
          <h2>Welcome back</h2>
          ${loginErr ? `<div class="error-banner">${esc(loginErr)}</div>` : ""}
          <form data-login-form class="mt">
            ${field("email", "Email", "you@school.edu", "email")}
            ${field("password", "Password", "Your password", "password")}
            <button class="btn" style="width:100%">Log in</button>
          </form>
        </div>

        <div class="auth-divider"><span>New here? Create your account</span></div>

        <div class="card">
          <div class="between"><h2>Create account</h2>
            <select name="signup-role" class="role-select" style="width:auto">
              <option value="student">Student</option>
              <option value="parent">Parent</option>
            </select>
          </div>
          ${signupErr ? `<div class="error-banner mt">${esc(signupErr)}</div>` : ""}
          <form data-signup-form class="mt">
            ${field("name", "Full name", "Your name")}
            <div data-student-only>${field("grade", "Grade", "e.g. 11")}</div>
            ${field("school", "School", "Your school")}
            ${field("email", "Email", "you@school.edu", "email")}
            ${field("password", "Password (6+ chars)", "Create a password", "password")}
            <button class="btn" style="width:100%">Create account</button>
          </form>
        </div>
      </div>
    </div>`;

  const roleSel = view.querySelector('select[name="signup-role"]');
  const toggleGrade = () => {
    view.querySelectorAll("[data-student-only]").forEach((el) => el.classList.toggle("hidden", roleSel.value !== "student"));
  };
  toggleGrade();
  roleSel.addEventListener("change", toggleGrade);

  view.querySelector("[data-login-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    showLoader(true);
    try {
      const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }) });
      state.token = res.access_token; state.user = res.user;
      localStorage.setItem("novi_token", state.token); localStorage.setItem("novi_user", JSON.stringify(state.user));
      renderShell(); dispatch();
    } catch (ex) { state._loginErr = ex.message; renderAuth(); }
    finally { showLoader(false); }
  });

  view.querySelector("[data-signup-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get("name"),
      email: fd.get("email"),
      password: fd.get("password"),
      role: roleSel.value,
      school: fd.get("school") || null,
      grade: fd.get("grade") ? Number(fd.get("grade")) : null,
    };
    showLoader(true);
    try {
      const res = await api("/auth/signup", { method: "POST", body: JSON.stringify(payload) });
      state.token = res.access_token; state.user = res.user;
      localStorage.setItem("novi_token", state.token); localStorage.setItem("novi_user", JSON.stringify(state.user));
      renderShell(); dispatch();
    } catch (ex) { state._signupErr = ex.message; renderAuth(); }
    finally { showLoader(false); }
  });
}

/* ---------------------------------------------------------------- shell + router */
const studentNav = [
  ["dashboard", "Dashboard"], ["chat", "Chat"], ["dna", "My DNA"],
  ["careers", "Careers"], ["universities", "Universities"],
  ["roadmap", "Roadmap"], ["passport", "Passport"], ["checkin", "Check-in"],
  ["profile", "Profile"],
];
const parentNav = [["overview", "Overview"], ["advisor", "Parent Advisor"]];
const NAV_ICONS = {
  dashboard: "◈", chat: "💬", dna: "🧬", careers: "🎯", universities: "🎓",
  roadmap: "🗺️", passport: "🏅", checkin: "✓", profile: "👤",
  overview: "📊", advisor: "🧠",
};

function renderShell() {
  topbar.classList.remove("hidden");
  appEl.classList.remove("logged-out");
  nav.innerHTML = "";
  const items = state.user.role === "parent" ? parentNav : studentNav;
  for (const [key, label] of items) {
    const b = document.createElement("button");
    b.innerHTML = `<span class="nav-ico">${NAV_ICONS[key] || "•"}</span><span>${label}</span>`;
    b.dataset.route = key;
    b.addEventListener("click", () => { location.hash = key; });
    nav.appendChild(b);
  }
  const su = document.getElementById("sidebar-user");
  if (su) {
    const name = state.user.first_name || state.user.name || state.user.email || "";
    const grade = state.user.grade ? ` · Grade ${state.user.grade}` : "";
    su.innerHTML = `<b>${esc(name)}</b>${grade}`;
  }
}

/* ---------------------------------------------------------------- router */
function dispatch() {
  if (!state.token) return;
  const key = (location.hash || "#dashboard").slice(1);
  const navKey = key.startsWith("career") ? "careers" : key.startsWith("university") ? "universities" : key;
  nav.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.route === navKey));
  window.scrollTo(0, 0);
  const routes = state.user.role === "parent"
    ? { overview: renderOverview, advisor: renderAdvisor }
    : { dashboard: renderDashboard, chat: renderChat, dna: renderDna, careers: renderCareers, universities: renderUniversities, roadmap: renderRoadmap, passport: renderPassport, checkin: renderCheckin, profile: renderProfile };
  if (key.startsWith("career/")) return detailRoute((s) => renderCareerDetail(s), undefined);
  if (key.startsWith("university/")) return detailRoute((s) => renderUniversityDetail(s), undefined);
  const fn = routes[key];
  if (fn) fn(); else routes[allowedFirst()]();
  enterView();
}
function detailRoute(f, arg) { f(arg); enterView(); }
function allowedFirst() { return state.user.role === "parent" ? "overview" : "dashboard"; }

window.addEventListener("hashchange", () => state.token && dispatch());

/* ---------------------------------------------------------------- settings */
function settingsAvatar(name) {
  const p = String(name || "NOVI").trim().split(/\s+/).filter(Boolean);
  return (p[0]?.[0] || "N").toUpperCase() + (p[1]?.[0] || "").toUpperCase();
}

async function renderProfile() {
  const u = state.user;
  showLoader(true); view.innerHTML = "";
  let updated = state._profileMsg || ""; delete state._profileMsg;
  const isStudent = u.role === "student";
  const firstName = u.first_name || u.name || "";
  const initialsTxt = settingsAvatar(firstName || u.email);
  const joined = u.created_at ? new Date(String(u.created_at).length === 10 ? u.created_at + "T00:00:00" : u.created_at).toLocaleDateString([], { year: "numeric", month: "short" }) : "—";
  view.innerHTML = `
    <div class="hero"><h1>Settings</h1><p>Your account, personal details and security.</p></div>
    ${updated ? `<div class="card novi-box mb" style="padding:12px 16px"><span class="novi-avatar">N</span><span>${esc(updated)}</span></div>` : ""}

    <div class="settings">
      <div class="card settings-account">
        <div class="pf-avatar">${esc(initialsTxt)}</div>
        <h3>${esc(firstName || u.email)}</h3>
        <p class="small muted">${esc(u.email)}</p>
        <p class="small muted">${isStudent ? "Student" : "Parent"} · Member since ${esc(joined)}</p>
        ${isStudent && u.grade ? `<span class="pill mid">Grade ${esc(u.grade)}</span>` : ""}
        <div class="acc-actions">
          <button class="btn-ghost" id="pf-refresh">↻ Refresh account</button>
          <button class="btn-ghost" id="pf-logout">Log out</button>
        </div>
      </div>

      <div class="settings-main">
        <div class="card settings-card">
          <div class="sc-head"><span class="sc-icon">👤</span><h2>Profile details</h2></div>
          <p class="small muted sc-desc">Used to personalize advice, roadmaps and university matches.</p>
          <div class="form-grid">
            <div class="field"><label>First name</label><input id="pf-first" value="${esc(firstName.split(" ")[0] || "")}"></div>
            <div class="field"><label>Last name</label><input id="pf-last" value="${esc(firstName.split(" ").slice(1).join(" ") || u.last_name || "")}"></div>
            <div class="field"><label>Email</label><input value="${esc(u.email || "")}" disabled></div>
            <div class="field"><label>Role</label><input value="${esc(isStudent ? "Student" : "Parent")}" disabled></div>
            ${isStudent ? `
            <div class="field"><label>Grade</label><input id="pf-grade" type="number" min="9" max="12" value="${u.grade || ""}"></div>
            <div class="field"><label>School</label><input id="pf-school" value="${esc(u.school || "")}"></div>` : ""}
          </div>
          <div class="form-actions"><button class="btn" id="pf-save">Save changes</button></div>
        </div>

        <div class="card settings-card">
          <div class="sc-head"><span class="sc-icon">🔒</span><h2>Security</h2></div>
          <p class="small muted sc-desc">Update your password to keep your account secure.</p>
          <div class="form-grid">
            <div class="field"><label>Current password</label><input id="pw-current" type="password" autocomplete="current-password"></div>
            <div class="field"><label>New password (6+ chars)</label><input id="pw-new" type="password" autocomplete="new-password"></div>
          </div>
          <div class="field"><label>Confirm new password</label><input id="pw-confirm" type="password" autocomplete="new-password"></div>
          <div class="form-actions"><button class="btn" id="pw-save">Update password</button><span class="form-note muted" id="pw-result"></span></div>
        </div>

        <div class="card settings-card">
          <div class="sc-head"><span class="sc-icon">🛡️</span><h2>About your data</h2></div>
          <ul class="plain mt">
            <li>👤 Your profile details personalize age-appropriate advice.</li>
            ${isStudent ? `
            <li>🧬 Your Career DNA powers career matching, roadmaps and university readiness.</li>
            <li>💬 Chat history teaches Novi who you are becoming — change it anytime in My DNA.</li>
            <li>👪 Your parents can view your progress if you're linked to them.</li>` : `
            <li>🧠 Parent Advisor gives you a focused view of your child's journey.</li>`}
          </ul>
        </div>
      </div>
    </div>`;

  const saveProfile = async () => {
    showLoader(true);
    try {
      const first = view.querySelector("#pf-first").value.trim();
      const last = view.querySelector("#pf-last").value.trim();
      const payload = { first_name: first, last_name: last };
      if (view.querySelector("#pf-grade")) payload.grade = view.querySelector("#pf-grade").value ? Number(view.querySelector("#pf-grade").value) : null;
      if (view.querySelector("#pf-school")) payload.school = view.querySelector("#pf-school").value;
      const me = await api("/auth/me", { method: "PATCH", body: JSON.stringify(payload) });
      state.user = me; localStorage.setItem("novi_user", JSON.stringify(state.user));
      renderShell();
      state._profileMsg = "Profile saved ✨";
      location.hash = "profile"; renderProfile();
    } catch (ex) { toast(ex.message); }
    finally { showLoader(false); }
  };
  view.querySelector("#pf-save").addEventListener("click", saveProfile);
  view.querySelector("#pf-refresh").addEventListener("click", async () => {
    showLoader(true);
    try { const me = await api("/auth/me"); state.user = me; localStorage.setItem("novi_user", JSON.stringify(state.user)); toast("Account refreshed ✓"); renderProfile(); }
    catch (ex) { toast(ex.message); }
    finally { showLoader(false); }
  });
  view.querySelector("#pf-logout").addEventListener("click", logout);
  view.querySelector("#pw-save").addEventListener("click", async () => {
    const cur = view.querySelector("#pw-current").value, next = view.querySelector("#pw-new").value, conf = view.querySelector("#pw-confirm").value;
    const resEl = view.querySelector("#pw-result");
    if (!cur || !next) { resEl.innerHTML = `<span style="color:var(--warn)">Please fill in current and new password.</span>`; return; }
    if (next !== conf) { resEl.innerHTML = `<span style="color:var(--bad)">New passwords don't match.</span>`; return; }
    showLoader(true);
    try {
      await api("/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: cur, new_password: next }) });
      view.querySelector("#pw-current").value = ""; view.querySelector("#pw-new").value = ""; view.querySelector("#pw-confirm").value = "";
      resEl.innerHTML = `<span style="color:var(--good)">Password updated ✓</span>`;
      } catch (ex) { resEl.innerHTML = `<span style="color:var(--bad)">${esc(ex.message)}</span>`; }
    finally { showLoader(false); }
  });
  showLoader(false);
}

/* ---------------------------------------------------------------- dashboard */
async function renderDashboard() {
  showLoader(true); view.innerHTML = "";
  try {
    const d = await api("/dashboard");
    const contrib = await api("/checkins/graph").catch(() => null);
    const p = d.progress || {};
    const num = (v) => (typeof v === "number" ? Math.round(v) : typeof v === "string" ? v : "—");
    const pct = (v) => (typeof v === "number" ? `${Math.round(v)}%` : v === undefined || v === null ? "—" : `${v}%`);
    const firstName = (state.user.first_name || state.user.name || "there").split(" ")[0];
    const goals = d.goals || [];
    const activeGoals = goals.filter((g) => g.status === "active");
    const pausedGoals = goals.filter((g) => g.status === "paused");
    const steps = d.roadmap_items || [];
    const stepsDone = steps.filter((i) => i.completed).length;
    const prios = d.priorities || [];
    const prioOpen = prios.filter((x) => !x.completed);
    const passportScore = Math.round((d.passport_completion || {}).score || 0);
    const topCareer = (d.career_matches || [])[0];
    const dir = p.career_direction || "Exploring";
    const dirTone = dir === "On Track" ? "good" : dir === "Exploring" ? "warn" : "bad";
    const dirColor = dirTone === "good" ? "var(--good)" : dirTone === "warn" ? "var(--warn)" : "var(--bad)";
    const prof = typeof p.profile_strength === "number" ? Math.round(p.profile_strength) : 0;
    const uni = num(p.university_readiness);
    const rm = num(p.roadmap_progress);
    const passSugg = (d.passport_completion && d.passport_completion.suggested_next) ? ` · ${String(d.passport_completion.suggested_next).toLowerCase()}` : "";

    const focus = d.today_focus || null;
    const doAction = !focus ? null
      : focus.kind === "task" ? { kind: "task", id: focus.id, label: focus.title }
      : focus.kind === "roadmap" ? { kind: "roadmap", id: focus.id, label: focus.title }
      : focus.kind === "priority" ? { kind: "priority", id: focus.id, label: focus.title }
      : null;

    const crownSub =
      activeGoals.length
        ? `Chasing <b>${esc(activeGoals[0].title)}</b>${activeGoals.length > 1 ? ` +${activeGoals.length - 1} more goal${activeGoals.length > 2 ? "s" : ""}` : ""}`
        : pausedGoals.length ? `Goal <b>${esc(pausedGoals[0].title)}</b> is on hold — resume it to light the map`
        : goals.length ? `Goal <b>${esc(goals[0].title)}</b> is done — set your next one`
        : "Set your first goal to light the map";

    const getOb = async () => { try { return await api("/onboarding"); } catch (_) { return null; } };
    const ob = await getOb();
    const journeyDone = ob && !ob.next_action;

    const mini = (icon, title, line, btn, route) => `
      <div class="mini-card">
        <span class="sm-ico">${icon}</span>
        <h3>${title}</h3>
        <div class="mini-line">${line}</div>
        <button class="btn-ghost small mt" data-go="${route}">Open ${btn} →</button>
      </div>`;

    view.innerHTML = `
      <div class="hero dash-hero">
        ${kicker(`Good ${bellTime()}, ${esc(firstName)}`)}
        <h1>${esc(firstName)}, here's how you're <span class="grad">growing</span></h1>
        <p>One glance at where you are — and one clear next move.</p>
        <button class="btn hero-chat" id="dash-chat">💬 Chat with Novi</button>
      </div>

      <div class="dash-crown">
        <div class="dash-mom">
          ${ringHTML(prof, `${prof}%`, 92)}
          <div>
            <div class="kicker" style="margin:0">your momentum</div>
            <h2 style="color:${dirColor}">${esc(dir)}</h2>
            <p class="small muted" style="margin-top:3px">${crownSub}</p>
          </div>
        </div>
        <div class="dash-chips">
          <div class="chip-big"><span class="cb-ico">🎯</span><div><b style="color:${dirColor}">${esc(dir)}</b><span>direction</span></div></div>
          <div class="chip-big"><span class="cb-ico">🎓</span><div><b style="color:${ringColor(uni)}">${pct(p.university_readiness)}</b><span>university ready</span></div></div>
          <div class="chip-big"><span class="cb-ico">🗺️</span><div><b style="color:${ringColor(rm)}">${pct(p.roadmap_progress)}</b><span>roadmap done</span></div></div>
          <div class="chip-big"><span class="cb-ico">🏅</span><div><b style="color:${ringColor(passportScore)}">${passportScore}%</b><span>passport proof</span></div></div>
        </div>
      </div>

      ${ob && !journeyDone ? `
        <div class="card slim-card">
          <div class="between"><h3>Your journey <span class="muted small">${ob.done}/${ob.total} steps</span></h3>
            <button class="btn mt" id="journey-next">${esc(ob.next_action ? ob.next_action.label : "Continue")} →</button></div>
          <div class="progress-track mt"><div class="progress-fill" style="width:${ob.percent}%"></div></div>
        </div>` : ""}

      ${d.today_focus ? `
        <div class="do-card">
          <div class="do-left"><span class="do-ico">🎯</span>
            <div>
              <div class="do-label">DO TODAY</div>
              <h2>${esc(d.today_focus.title)}</h2>
              <p class="small muted">${esc(d.today_focus.why || "")}</p>
            </div>
          </div>
          <div class="do-right">
            ${doAction ? `<button class="btn" id="do-done">✓ Mark done</button>` : `<button class="btn-ghost" id="dash-chat2">💬 Ask Novi</button>`}
          </div>
        </div>` : ""}

      <div class="mini-cards">
        ${mini(goals.length ? "🗺️" : "🎯", "Goals & roadmap", activeGoals.length ? `<b>${stepsDone}/${steps.length}</b> steps done across ${activeGoals.length} active goal${activeGoals.length > 1 ? "s" : ""}` : pausedGoals.length ? `Goal <b>${esc(pausedGoals[0].title)}</b> is on hold · resume it to start your map` : steps.length ? `<b>${stepsDone}/${steps.length}</b> steps done` : "No goals yet — start your map", "Roadmap", "roadmap")}
        ${mini("💼", "Top career", topCareer ? `<b>${esc(topCareer.career.emoji || "🎯")} ${esc(topCareer.career.title)}</b> · <span style="color:${ringColor(topCareer.score)}">${Math.round(topCareer.score)}% match</span>` : "Chat with Novi to discover your path", "Careers", "careers")}
        ${mini("🏅", "Passport", d.passport_completion ? `<b>${passportScore}%</b> complete${passSugg}` : "Add your first win", "Passport", "passport")}
        ${mini("📅", "This week", prioOpen.length ? `<b>${(d.priorities || []).length - prioOpen.length}/${(d.priorities || []).length}</b> done · next: ${esc(prioOpen[0].title)}` : "All priorities done. Nice!", "Roadmap", "roadmap")}
      </div>

      ${contrib ? contributionGraphHTML(contrib) : ""}

      <div class="card novi-strip">
        <span class="novi-avatar">N</span>
        <div><p class="small">${esc(d.novi_says || "I'm here whenever you need me — ask me anything about your path.")}</p></div>
        <button class="btn-ghost" id="dash-chat3">💬 Chat</button>
      </div>

      <button class="fab" id="dash-fab" title="Chat with Novi">💬 <span>Novi</span></button>`;

    const go = (route) => () => { location.hash = route; };
    attachGraphTooltips(view);
    document.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", go(el.dataset.go)));
    ["#dash-chat", "#dash-chat2", "#dash-chat3", "#dash-fab"].forEach((sel) => {
      const el = view.querySelector(sel); if (el) el.addEventListener("click", () => { location.hash = "chat"; });
    });
    const jn = view.querySelector("#journey-next");
    if (jn) jn.addEventListener("click", () => { location.hash = ob.next_action ? ob.next_action.route : "chat"; });
    const dd = view.querySelector("#do-done");
    if (dd) dd.addEventListener("click", async () => {
      showLoader(true);
      try {
        if (doAction.kind === "task") await api(`/roadmap/tasks/${doAction.id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
        else if (doAction.kind === "roadmap") await api(`/roadmap/items/${doAction.id}`, { method: "PATCH" });
        else await api(`/roadmap/priorities/${doAction.id}`, { method: "PATCH" });
        toast("Nice work — knocked it out ✓"); renderDashboard();
      } catch (ex) { toast(ex.message); showLoader(false); }
    });
  } catch (ex) { view.innerHTML = emptyState("Could not load dashboard", ex.message); }
  finally { showLoader(false); }
}

/* ---------------------------------------------------------------- chat */
let activeConversationId = null, chatHistory = [];

async function renderChat() {
  showLoader(true); view.innerHTML = "";
  activeConversationId = null; chatHistory = [];
  try {
    const convos = await api("/chat/conversations");
    view.innerHTML = `
      <div class="chat-shell">
        <div class="chat-side">
          <div class="side-head"><h2>Conversations</h2><button class="btn-ghost" style="padding:7px 12px" id="new-chat">+ New</button></div>
          <div id="conv-list" class="conv-list"></div>
        </div>
        <div class="chat-main">
          <div class="chat-head">
            <div class="chat-avatar">N</div>
            <div><div class="chat-head-name">Novi</div><div class="chat-status">Always remembers your journey</div></div>
            <div class="spacer"></div>
            <button class="btn-ghost small" id="new-chat2">New chat</button>
          </div>
          <div class="chat-log" id="chat-log"><div class="welcome" id="chat-welcome">
            <div class="wa brand-mark">N</div>
            <h2>Hey ${esc((state.user.first_name || state.user.name || "").split(" ")[0] || "there")} 👋</h2>
            <p>I'm Novi. I've been learning you from your DNA, your check-ins and your journey. Ask me anything.</p>
            <div class="sugg">
              <button data-sugg="What career fits my strengths?">What career fits my strengths?</button>
              <button data-sugg="Which subjects should I focus on?">Which subjects should I focus on?</button>
              <button data-sugg="What should I be doing this month?">What should I be doing this month?</button>
              <button data-sugg="Show me universities that fit me.">Show me universities that fit me.</button>
              <button data-sugg="Help me build a strong profile.">Help me build a strong profile.</button>
            </div>
          </div></div>
          <div class="chat-input">
            <input id="chat-text" placeholder="Ask Novi anything…" autocomplete="off">
            <button class="btn chat-send" id="chat-send" title="Send">➤</button>
            <button class="btn btn-archive" id="chat-archive" title="Archive this message">💾</button>
          </div>
        </div>
      </div>`;
    const convList = view.querySelector("#conv-list");
    const fmtAgo = (iso) => {
      if (!iso) return "";
      const then = new Date(iso).getTime(), diff = Date.now() - then;
      if (isNaN(then)) return esc(iso.slice(0, 10));
      if (diff < 6e4) return "just now";
      if (diff < 36e5) return Math.floor(diff / 6e4) + "m";
      if (diff < 864e5) return Math.floor(diff / 36e5) + "h";
      if (diff < 864e5 * 7) return Math.floor(diff / 864e5) + "d";
      return esc(String(iso).slice(0, 10));
    };
    const renderConvs = (selectId) => {
      convList.innerHTML = convos.length
        ? convos.map((c) => `<div class="conv-item ${c.id === selectId ? "active" : ""}" data-cid="${c.id}">
            <div class="ci-title">${esc(c.title || "New chat")}</div>
            <div class="ci-sub"><span>${esc((c.last_message || "").slice(0, 42) || "No messages yet")}</span><span>${fmtAgo(c.updated_at)}</span></div></div>`).join("")
        : `<div class="muted small" style="padding:8px 12px">No conversations yet — say hi below.</div>`;
    };
    renderConvs(null);
    convList.addEventListener("click", (e) => {
      const el = e.target.closest("[data-cid]"); if (!el) return;
      loadConversation(Number(el.dataset.cid));
    });
    if (convos.length) {
      const latest = convos[0];
      renderConvs(latest.id);
      loadConversation(latest.id);
    }
    const reset = () => { activeConversationId = null; chatHistory = []; window.location.hash = "chat"; renderChat(); };
    view.querySelector("#new-chat").addEventListener("click", reset);
    view.querySelector("#new-chat2").addEventListener("click", reset);
    view.querySelector("#chat-send").addEventListener("click", sendChat);
    view.querySelector("#chat-text").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
    view.querySelectorAll("[data-sugg]").forEach((b) => b.addEventListener("click", () => {
      const inp = view.querySelector("#chat-text");
      inp.value = b.dataset.sugg;
      inp.focus();
      sendChat();
    }));
    showLoader(false);
  } catch (ex) { view.innerHTML = emptyState("Chat unavailable", ex.message); showLoader(false); }
}

async function loadConversation(cid) {
  activeConversationId = cid;
  document.querySelectorAll(".conv-item").forEach((el) => el.classList.toggle("active", Number(el.dataset.cid) === cid));
  const msgs = await api(`/chat/conversations/${cid}/messages`);
  chatHistory = msgs;
  renderMessages();
}

function openConversation(cid) {
  if (location.hash !== "chat") location.hash = "chat";
  else if (state.token) renderChat();
  let tries = 0;
  const poll = setInterval(() => {
    tries += 1;
    const el = document.querySelector(`[data-cid="${cid}"]`);
    if (el) { clearInterval(poll); loadConversation(cid); el.closest(".conv-item") && el.scrollIntoView({ block: "nearest" }); }
    else if (tries > 30) { clearInterval(poll); loadConversation(cid); }
  }, 120);
}

function msgTime(m) {
  const t = m.created_at || m.createdAt || m.timestamp;
  if (!t) return "";
  const d = new Date(t);
  return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMessages() {
  const log = document.querySelector("#chat-log"); if (!log) return;
  const userName = (state.user.first_name || state.user.name || "You") + "";
  log.innerHTML = chatHistory.length ? chatHistory.map((m) => {
    const tm = msgTime(m);
    if (m.role === "user") return `<div class="chat-row user"><div class="chat-avatar">${esc(initials(userName))}</div><div class="bubble">${esc(m.content)}${tm ? `<span class="meta">${tm}</span>` : ""}</div></div>`;
    return `<div class="chat-row novi"><div class="chat-avatar">N</div><div class="bubble">${esc(m.content)}${tm ? `<span class="meta">${tm}</span>` : ""}</div></div>`;
  }).join("") : `<div class="welcome"><div class="wa brand-mark">N</div><h2>Hey 👋</h2><p>This conversation is empty. Ask Novi anything.</p></div>`;
  log.scrollTop = log.scrollHeight;
}

async function sendChat() {
  const inp = document.querySelector("#chat-text"); if (!inp) return;
  const text = inp.value.trim(); if (!text) return;
  inp.value = "";
  chatHistory.push({ role: "user", content: text });
  renderMessages();
  const log = document.querySelector("#chat-log");
  log.insertAdjacentHTML("beforeend", `<div class="chat-row novi"><div class="chat-avatar">N</div><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div>`);
  log.scrollTop = log.scrollHeight;
  try {
    const res = await api("/chat", { method: "POST", body: JSON.stringify({ message: text, conversation_id: activeConversationId }) });
    activeConversationId = res.conversation_id;
    chatHistory.push({ role: "assistant", content: res.message, created_at: new Date().toISOString() });
    // Archive the user's message to Letta memory
    await api("/memory/archive", { method: "POST", body: JSON.stringify({ fact: text, tags: ["chat"] }) });
    renderMessages();
    const convos = await api("/chat/conversations");
    const list = document.querySelector("#conv-list");
    if (list) {
      const cur = convos.find((c) => c.id === activeConversationId);
      list.innerHTML = convos.map((c) => `<div class="conv-item ${c.id === activeConversationId ? "active" : ""}" data-cid="${c.id}">
        <div class="ci-title">${esc(c.title || "New chat")}</div>
        <div class="ci-sub"><span>${esc((c.last_message || (c.id === activeConversationId ? text.slice(0, 42) : "") || "No messages yet"))}</span><span>${c.id === activeConversationId ? "now" : ""}</span></div></div>`).join("");
    }
  } catch (ex) { chatHistory.push({ role: "assistant", content: "⚠️ " + ex.message }); renderMessages(); }
}

/* ---------------------------------------------------------------- DNA */
async function renderDna() {
  showLoader(true); view.innerHTML = "";
  try {
    const [dna, conversations] = await Promise.all([
      api("/dna"),
      api("/chat/conversations").catch(() => []),
    ]);
    const field = (key, label, ph) => `<div class="field"><label>${label}</label><input data-field="${key}" placeholder="${ph}" value="${esc((dna[key] || []).join(", "))}"></div>`;
    const sources = dna.sources || {};
    const mapping = [["interests", "Interests"], ["skills", "Skills"], ["subjects", "Subjects"], ["goals", "Goals"], ["career_zones", "Career zones"], ["values", "Values"], ["traits", "Traits"], ["motivations", "Motivations"], ["strengths", "Strengths"]];
    const evidenceOf = (k) => {
      const block = (sources[k] || []).filter((e) => e.quote).map((e) => {
        const cid = e.conversation_id;
        const quote = e.quote.length > 160 ? e.quote.slice(0, 160) + "…" : e.quote;
        const link = cid ? `<div class="q-link"><a class="small" style="color:var(--accent)" href="#chat" onclick="openConversation(${cid})">open chat →</a></div>` : "";
        return `<div class="dna-evidence"><span class="chip">${esc(e.value)}</span><div class="dna-quote">“${esc(quote)}”${link}</div></div>`;
      }).join("");
      return block;
    };
    const withEvidence = mapping.filter(([k]) => (sources[k] || []).some((e) => e.quote));
    const chatCount = (conversations || []).length;
    const updated = dna.updated_at ? new Date(dna.updated_at + "Z").toLocaleDateString([], { month: "short", day: "numeric" }) : "never";
    view.innerHTML = `
      <div class="hero">
        ${kicker("Know yourself")}
        <h1>My Career DNA</h1>
        <p>Novi reads every conversation you have with her and turns it into a living picture of who you are — interests, strengths, goals, the zones you keep gravitating toward.</p>
      </div>
      <div class="card novi-box mb">
        <div class="row">
          <span class="novi-avatar">N</span>
          <div style="flex:1">
            <b>How Novi learns about you</b>
            <div class="small muted">Every ${chatCount ? `${chatCount} conversation${chatCount > 1 ? "s" : ""} · last update ${updated}` : "chat with her and she listens"} → your DNA updates automatically. No forms, just talking.</div>
          </div>
        </div>
        <div class="dna-steps mt">
          <span class="chip">💬 You talk</span><span class="dna-arrow">→</span><span class="chip">🧠 Novi listens</span><span class="dna-arrow">→</span><span class="chip">🧬 DNA extracts</span>
        </div>
        <button class="btn mt" id="refresh-dna">🔄 Refresh from my chats</button>
      </div>
      <div class="card novi-box mb">
        <h3 class="mb">Novi's reflection</h3>
        <span class="novi-avatar mb">N</span><span>${dna.novi_reflection ? esc(dna.novi_reflection) : "Chat about your interests and Novi's reflection will fill here."}</span>
        <div class="row mt">
          <button class="btn" id="refl-yes">Yes, that's me ✓</button>
          <button class="btn-ghost" id="refl-no">Not quite</button>
        </div>
      </div>
      ${dna.dna_filled ? pill("DNA ready", "good") : `<span class="pill">Still learning about you</span>`}
      ${withEvidence.length ? `<div class="section-title">What Novi picked up from your chats</div>
      <div class="card mb">${withEvidence.map(([k, l]) => `<div class="mb"><h3 class="dna-sec">${esc(l)}</h3><div class="evidence-wrap">${evidenceOf(k)}</div></div>`).join("")}</div>` : `
      <div class="card mb"><p class="small muted">No chat evidence yet — start a conversation in <a href="#chat" style="color:var(--accent)">Chat</a> and Novi will extract your DNA from what you say.</p></div>`}
      <div class="section-title">Currently mapped</div>
      <div class="cols">
        ${[["interests", "Interests"], ["strengths", "Strengths"], ["subjects", "Subjects"], ["goals", "Goals"], ["career_zones", "Career zones"], ["values", "Values"]].map(([k, l]) => `
          <div class="card"><h3>${l}</h3><div class="dna-tag-row mt">${(dna[k] || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("") || `<span class="muted small">Not set yet</span>`}</div></div>`).join("")}
      </div>
      <div class="section-title">Fine-tune by hand (optional)</div>
      <div class="card">
        ${field("interests", "Interests", "robotics, AI, music…")}
        ${field("subjects", "Subjects you enjoy", "maths, computer science…")}
        ${field("strengths", "Strengths", "coding, teamwork…")}
        ${field("development_areas", "Want to grow in", "public speaking…")}
        ${field("goals", "Career goals", "build an AI company")}
        ${field("values", "Values", "creativity, impact…")}
        <div class="row">
          <button class="btn" id="save-dna">Save DNA</button>
          ${!dna.dna_filled ? `<button class="btn-ghost" id="finalize-dna">Finalize DNA ✓</button>` : `<span class="chip acc">DNA locked · ready for matching</span>`}
        </div>
      </div>`;
    view.querySelector("#save-dna").addEventListener("click", async () => {
      const payload = {};
      view.querySelectorAll("[data-field]").forEach((inp) => { payload[inp.dataset.field] = inp.value.split(",").map((s) => s.trim()).filter(Boolean); });
      showLoader(true);
      try { const updated = await api("/dna", { method: "PATCH", body: JSON.stringify(payload) }); toast("DNA updated ✨"); location.hash = "dna"; renderDna(); }
      catch (ex) { toast(ex.message); }
      finally { showLoader(false); }
    });
    view.querySelector("#refresh-dna").addEventListener("click", async () => {
      const btn = view.querySelector("#refresh-dna");
      const old = btn.textContent;
      btn.textContent = "🧠 Reading your conversations…";
      btn.disabled = true;
      showLoader(false);
      let done = false;
      const steps = ["🧠 Reading your conversations…", "🔍 Picking out signals…", "🧬 Extracting your DNA…"];
      const ticker = setInterval(() => {
        btn.textContent = steps[(steps.indexOf(btn.textContent) + 1) % steps.length];
      }, 900);
      try {
        await api("/dna/refresh", { method: "POST" });
        done = true;
        toast("DNA refreshed from your chats 🧬");
        location.hash = "dna"; renderDna();
      } catch (ex) {
        toast(ex.message);
        btn.textContent = old; btn.disabled = false;
      } finally { clearInterval(ticker); }
    });
    const finBtn = view.querySelector("#finalize-dna");
    if (finBtn) finBtn.addEventListener("click", async () => {
      showLoader(true);
      try { await api("/dna/reflect", { method: "POST", body: JSON.stringify({ accepted: true }) }); toast("DNA finalised — you're ready to match 🎯"); location.hash = "dna"; renderDna(); }
      catch (ex) { toast(ex.message); }
      finally { showLoader(false); }
    });
    const reflYes = view.querySelector("#refl-yes");
    if (reflYes) reflYes.addEventListener("click", async () => {
      showLoader(true);
      try { await api("/dna/reflect", { method: "POST", body: JSON.stringify({ accepted: true }) }); toast("That makes me happy to hear 🎉"); location.hash = "dna"; renderDna(); }
      catch (ex) { toast(ex.message); }
      finally { showLoader(false); }
    });
    const reflNo = view.querySelector("#refl-no");
    if (reflNo) reflNo.addEventListener("click", async () => {
      const feedback = prompt("What feels off? Tell Novi what's more true for you:", "");
      if (feedback === null) return;
      showLoader(true);
      try { await api("/dna/reflect", { method: "POST", body: JSON.stringify({ accepted: false, feedback }) }); toast("Got it — Novi will keep learning 🧬"); location.hash = "dna"; renderDna(); }
      catch (ex) { toast(ex.message); }
      finally { showLoader(false); }
    });
  } catch (ex) { view.innerHTML = emptyState("DNA unavailable", ex.message); }
  finally { showLoader(false); }
}

/* ---------------------------------------------------------------- careers */
let careerFilter = "";
async function renderCareers() {
  showLoader(true); view.innerHTML = "";
  try {
    const [list, categories, savedMatches] = await Promise.all([
      api("/careers?limit=50"), api("/careers/categories"), api("/careers/matches").catch(() => []),
    ]);
    const matchMap = {};
    (savedMatches || []).forEach((m) => { matchMap[m.career.slug] = m.score; });
    const FAMOUS_CATS = ["Technology", "Science", "Marketing", "Law", "Finance", "Engineering", "Business"];
    const filterCats = (categories || []).filter((c) => FAMOUS_CATS.includes(String(c).trim()));
    const topMatchCard = (m) => `
      <div class="list-item top-match mb" style="cursor:pointer" data-m-slug="${esc(m.career.slug)}">
        <div class="row">
          <div class="num-badge">#1</div>
          <div style="flex:1"><b>${m.career.emoji} ${esc(m.career.title)}</b>
            <div class="small muted">the one career Novi rates highest for you right now</div></div>
          <b style="color:${ringColor(m.score)}">${Math.round(m.score)}%</b>
        </div>
        <ul class="plain mt">${(m.reasons || []).map((r) => `<li class="small">${esc(r)}</li>`).join("")}</ul>
      </div>`;
    view.innerHTML = `
      <div class="hero">${kicker("Explore verified paths")}<h1>Career Explorer</h1><p>There are thousands of careers you've never heard of. Novi surfaces the ones that could be <b style="color:var(--text)">you</b>.</p></div>
      
      <div class="card mb">
        <div class="career-search">
          <input id="career-q" placeholder="Search careers, interests or skills — try ‘AI’, ‘design’, ‘finance’…">
          <button class="btn" id="career-match">✨ Match with AI</button>
        </div>
        <div class="cat-row">
          <button class="cat-pill on" data-cat="">All</button>
          ${filterCats.map((c) => `<button class="cat-pill" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}
        </div>
        <div id="match-result" class="mt">
          ${(savedMatches || []).length ? `<div class="section-title">Your #1 career match</div>${topMatchCard(savedMatches[0])}` : ""}
        </div>
      </div>
      <div class="career-grid" id="career-grid">
        ${list.map((c) => `
          <div class="card career-card" data-slug="${esc(c.slug)}" data-cat-list="${esc(c.category)}">
            <div class="career-top">
              <div class="career-emoji">${c.emoji}</div>
              ${matchMap[c.slug] !== undefined
                ? `<span class="pill mid" title="AI match score">${Math.round(matchMap[c.slug])}% match</span>`
                : `<span class="pill" style="background:var(--panel-2);color:var(--muted)">${esc(c.category)}</span>`}
            </div>
            <div class="cc-title">${esc(c.title)}</div>
            <div class="cc-meta">${esc(c.salary_range || c.category)}</div>
            <p class="cc-summary">${esc(c.summary)}</p>
            ${(c.country_rankings || []).length ? `<div class="country-row" title="Best countries for this career">${c.country_rankings.map((ct, i) => `<span class="country-flag${i ? "" : " top"}">${esc(ct)}</span>`).join('<span class="country-arrow">→</span>')}</div>` : ""}
            <div class="cc-foot">
              ${matchMap[c.slug] !== undefined ? `<div class="progress-track"><div class="progress-fill" style="width:${matchMap[c.slug]}%;background:${ringColor(matchMap[c.slug])}"></div></div>` : ""}
              <span class="small muted">View career →</span>
            </div>
          </div>`).join("")}
      </div>`;
    const q = view.querySelector("#career-q");
    const applyFilters = () => {
      const t = q.value.toLowerCase();
      const on = view.querySelector(".cat-pill.on");
      const cat = on ? (on.dataset.cat || "").toLowerCase() : "";
      view.querySelectorAll("[data-slug]").forEach((el) => {
        const inCat = !cat || ((el.dataset.catList || "").toLowerCase() === cat);
        const inQuery = !t || el.textContent.toLowerCase().includes(t);
        el.classList.toggle("hidden", !(inCat && inQuery));
      });
    };
    q.addEventListener("input", applyFilters);
    view.querySelectorAll(".cat-pill").forEach((b) => b.addEventListener("click", () => {
      view.querySelectorAll(".cat-pill").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      applyFilters();
    }));
    view.querySelector("#career-grid").addEventListener("click", (e) => {
      const el = e.target.closest("[data-slug]"); if (el) location.hash = "career/" + el.dataset.slug;
    });
    view.querySelector("#match-result").addEventListener("click", (e) => {
      const el = e.target.closest("[data-m-slug]"); if (el) location.hash = "career/" + el.dataset.mSlug;
    });
    view.querySelector("#career-match").addEventListener("click", async () => {
      showLoader(true);
      try {
        const res = await api("/careers/match", { method: "POST", body: JSON.stringify({ limit: 1, focus: q.value?.trim() || null }) });
        document.querySelector("#match-result").innerHTML = `<div class="section-title">Your #1 career match</div>` + (res.length ? topMatchCard(res[0]) : `<p class="small muted">No strong match yet — keep refining your DNA or searching.</p>`);
        document.querySelector("#match-result").addEventListener("click", (e) => {
          const el = e.target.closest("[data-m-slug]"); if (el) location.hash = "career/" + el.dataset.mSlug;
        });
      } catch (ex) { toast(ex.message); }
      finally { showLoader(false); }
    });
  } catch (ex) { view.innerHTML = emptyState("Careers unavailable", ex.message); }
  finally { showLoader(false); }
}

async function renderCareerDetail() {
  const slug = location.hash.slice(1).split("/")[1];
  showLoader(true); view.innerHTML = "";
  try {
    const c = await api(`/careers/${slug}`);
    const stepIcon = { project: "🛠️", skill: "📈", explore: "🔎" };
    const chips = (arr, cls = "") => (arr && arr.length ? `<div class="tag-list">${arr.map((s) => `<span class="chip ${cls}">${esc(s)}</span>`).join("")}</div>` : `<p class="small muted">Not mapped yet.</p>`);
    const facts = [
      ["Salary range", c.salary_range || "Varies", true],
      ["Career outlook", c.outlook || "—", true],
      ["Best countries", (c.country_rankings || []).length ? `<span class="country-row country-row-inline">${c.country_rankings.map((ct, i) => `<span class="country-flag${i ? "" : " top"}">${esc(ct)}</span>`).join('<span class="country-arrow">→</span>')}</span>` : "—", false],
      ["Degrees that lead here", (c.degrees || []).length ? c.degrees.join(" · ") : "—", true],
      ["Industries", (c.industries || []).length ? c.industries.join(" · ") : "—", true],
    ].filter(([, v]) => v && v !== "—");
    view.innerHTML = `
      <div class="hero">
        <a href="#careers" class="small" style="color:var(--accent)">← All careers</a>
        ${kicker(esc(c.category))}
        <h1>${c.emoji} ${esc(c.title)}</h1>
        <p>${esc(c.summary)}</p>
        <span class="chip acc" id="fit-chip" style="margin-top:10px;display:none"></span>
      </div>
      
      <div id="novi-fit" class="mb">
        <div class="card novi-box"><span class="novi-avatar">N</span><span class="small muted">Novi is working out how well this fits you…</span></div>
      </div>
      <div class="detail-layout">
        <div class="detail-main">
          <div class="card">
            <div class="block-title">What do they actually do?</div>
            <div class="how-line"><div class="hl-ico">💼</div><p>${esc(c.what_they_do || c.description)}</p></div>
            ${c.description && c.what_they_do ? `<p class="career-desc mt">${esc(c.description)}</p>` : ""}
          </div>
          <div class="fact-grid">
            ${facts.map(([k, v, safe]) => `<div class="fact"><div class="f-label">${esc(k)}</div><div class="f-value">${safe ? esc(v) : v}</div></div>`).join("")}
          </div>
          <div class="card">
            <div class="block-title">Your next steps</div>
            <div id="next-steps" class="grid" style="gap:14px"><p class="small muted">Novi is tailoring your next steps…</p></div>
          </div>
        </div>
        <div class="detail-side">
          <div class="card" id="fit-card">
            <div class="block-title">Fit for you</div>
            <p class="small muted">Scored against your Career DNA — interests, subjects, strengths and goals.</p>
          </div>
          <div class="card">
            <div class="block-title">Skills you'll need</div>
            ${chips(c.skills || [], "acc")}
            <div class="block-title mt">What should you study?</div>
            ${chips(c.subjects || [])}
          </div>
          <div class="card">
            <div class="block-title">Degrees that lead here</div>
            ${chips(c.degrees || [])}
            <div class="block-title mt">Industries</div>
            ${chips(c.industries || [])}
            <div class="block-title mt">Where this could take you</div>
            ${chips(c.future_paths || [], "acc")}
          </div>
        </div>
      </div>
    `;
    showLoader(false);
    api(`/careers/${slug}/advice`).then((adv) => {
      if (location.hash !== `#career/${slug}`) return;
      const chip = view.querySelector("#fit-chip");
      if (chip && adv.fit_rating) { chip.style.display = ""; chip.innerHTML = `<b>${Math.round(adv.fit_rating)}%</b> fit for you`; }
      const box = view.querySelector("#novi-fit");
      if (box && adv.fit_statement) {
        box.innerHTML = `
          <div class="card novi-box mb">
            <h3 class="mb">Why Novi thinks this could be you</h3>
            <span class="novi-avatar">N</span><span>${esc(adv.fit_statement)}</span>
            ${(adv.reasons || []).length ? `<ul class="plain mt">${adv.reasons.map((r) => `<li class="small">${esc(r)}</li>`).join("")}</ul>` : ""}
          </div>`;
      } else if (box) { box.remove(); }
      const fitCard = view.querySelector("#fit-card");
      if (fitCard && adv.fit_rating) {
        fitCard.innerHTML = `
          <div class="fit-head"><b>Fit for you</b><b style="color:${ringColor(adv.fit_rating)}">${Math.round(adv.fit_rating)}%</b></div>
          <div class="progress-track mt"><div class="progress-fill" style="width:${adv.fit_rating}%"></div></div>
          <p class="small muted mt">Scored against your Career DNA — interests, subjects, strengths and goals.</p>`;
      }
      const steps = view.querySelector("#next-steps");
      if (steps && (adv.next_steps || []).length) {
        steps.innerHTML = adv.next_steps.map((s) => `
          <div class="step-card" style="border:1px solid var(--border);background:var(--panel-2);border-radius:14px;padding:16px">
            <div class="between"><span class="step-icon">${stepIcon[s.type] || "→"}</span><span class="pill mid">${esc(s.type)}</span></div>
            <h3 class="mt">${esc(s.title)}</h3>
            <p class="small mt">${esc(s.why)}</p>
            <button class="btn-ghost mt" data-step-link="${esc(s.link)}">Take this step →</button>
          </div>`).join("");
        steps.querySelectorAll("[data-step-link]").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.stepLink; }));
      }
    }).catch(() => {
      const box = view.querySelector("#novi-fit"); if (box) box.remove();
    });
  } catch (ex) { view.innerHTML = emptyState("Career not found", ex.message); showLoader(false); }
}

/* ---------------------------------------------------------------- universities */
async function renderUniversities() {
  showLoader(true); view.innerHTML = "";
  try {
    const [filters, rows] = await Promise.all([
      api("/universities/filters"), api("/universities?limit=30"),
    ]);
    let activeSubject = "";
    const subjLabel = (s) => (filters.subject_labels && filters.subject_labels[s]) || s || "";
    const uniRank = (u) => {
      if (activeSubject && u.rankings && typeof u.rankings[activeSubject] === "number") return u.rankings[activeSubject];
      return u.ranking;
    };
    const uniCard = (u) => {
      const r = activeSubject ? uniRank(u) : null;
      const caption = r == null && !activeSubject
        ? (uniRank(u) == null ? "" : `Top subject: #${uniRank(u)} in ${esc(u.course || u.subject || "")}`)
        : `Ranked #${r} in ${activeSubject ? esc(subjLabel(activeSubject)) : esc(u.course || u.subject || "")}`;
      return `
      <div class="card list-item" style="cursor:pointer" data-slug="${esc(u.slug)}">
        <div class="between"><h3>${esc(u.name)}</h3>${r == null ? "" : `<span class="pill mid">#${r}</span>`}</div>
        <p class="small mt">${esc(u.course)} · ${esc(u.country)} · ${esc(u.city)}</p>
        ${caption ? `<p class="small muted mt">${caption}</p>` : ""}
      </div>`;
    };
    const s = async () => {
      const params = new URLSearchParams({ limit: "30" });
      const country = document.querySelector("#uni-country").value, subject = document.querySelector("#uni-subject").value;
      activeSubject = subject;
      if (country) params.set("country", country); if (subject) params.set("subject", subject);
      const newRows = await api(`/universities?${params}`);
      const grid = document.querySelector("#uni-grid");
      grid.innerHTML = newRows.map(uniCard).join("");
    };
    view.innerHTML = `
      <div class="hero">${kicker("Find your program")}<h1>University Explorer</h1><p>Real QS 2026 rankings and programs from 1,900+ universities worldwide.</p></div>
      
      <div class="card mb" style="background:linear-gradient(135deg,var(--panel-2),var(--panel))">
        <div class="between">
          <div><h2 style="margin:0">🤖 Ask Novi which is best</h2><p class="small muted" style="margin:6px 0 0">Web-informed advice based on your Career DNA and real QS data.</p></div>
          <button class="btn" id="uni-advice-btn">Ask Novi 🎓</button>
        </div>
        <div id="uni-advice" class="mt"></div>
      </div>
      <div class="card mb">
        <div class="cols" style="gap:12px">
          <div class="field" style="margin:0"><label>Country</label><select id="uni-country"><option value="">All</option>${filters.countries.map((c) => `<option>${esc(c)}</option>`).join("")}</select></div>
          <div class="field" style="margin:0"><label>Subject</label><select id="uni-subject"><option value="">All</option>${filters.subjects.map((c) => `<option value="${esc(c)}">${esc(filters.subject_labels?.[c] || c)}</option>`).join("")}</select></div>
        </div>
      </div>
      <div class="cols" id="uni-grid">${rows.map(uniCard).join("")}</div>`;
    view.querySelector("#uni-country").addEventListener("change", s);
    view.querySelector("#uni-subject").addEventListener("change", s);
    view.querySelector("#uni-grid").addEventListener("click", (e) => {
      const el = e.target.closest("[data-slug]"); if (el) location.hash = "university/" + el.dataset.slug;
    });
    view.querySelectorAll("[data-slug]").forEach((el) => {
      if (!el.closest("#uni-grid")) el.addEventListener("click", () => { location.hash = "university/" + el.dataset.slug; });
    });
    const adviceBox = view.querySelector("#uni-advice"), adviceBtn = view.querySelector("#uni-advice-btn");
    adviceBtn.addEventListener("click", async () => {
      adviceBtn.disabled = true; adviceBtn.textContent = "Novi is thinking…";
      adviceBox.innerHTML = `<div class="small muted">Novi is searching the web and comparing programs for you…</div>`;
      try {
        const subject = document.querySelector("#uni-subject").value;
        const adv = await api("/universities/advice", { method: "POST", body: JSON.stringify({ question: "Which university is best for me?", subject: subject || undefined }) });
        const lines = String(adv.answer || "").split("\n").filter(Boolean);
        const sources = (adv.sources || []).filter((x) => x.uri);
        adviceBox.innerHTML = `
          <div class="row" style="gap:8px"><span class="novi-avatar">N</span><div style="flex:1">
            ${lines.map((l) => `<p class="small mb">${l}</p>`).join("")}
            ${sources.length ? `
              <div class="small muted mt"><b>Sources</b><ul class="plain">${sources.slice(0, 5).map((x) => `<li>🔗 <a href="${esc(x.uri)}" target="_blank" rel="noopener">${esc(x.title || x.domain || x.uri)}</a></li>`).join("")}</ul></div>` : ""}
          </div></div>`;
      } catch (ex) { adviceBox.innerHTML = `<p class="small" style="color:var(--bad)">${esc(ex.message)}</p>`; }
      adviceBtn.disabled = false; adviceBtn.textContent = "Ask Novi 🎓";
    });
  } catch (ex) { view.innerHTML = emptyState("Universities unavailable", ex.message); }
  finally { showLoader(false); }
}

async function renderUniversityDetail() {
  const slug = location.hash.slice(1).split("/")[1];
  showLoader(true); view.innerHTML = "";
  try {
    const u = await api(`/universities/${slug}`);
    view.innerHTML = `
      <div class="hero"><a href="#universities" class="small" style="color:var(--accent)">← All universities</a><h1 class="mt">${esc(u.name)}</h1><p>${esc(u.city)}, ${esc(u.country)} · <b>${esc(u.course)}</b> · Ranked #${u.ranking || "—"} in ${esc(u.course || u.subject || "")}</p></div>
      
      <div class="cols">
        <div class="card"><h2>About</h2><p class="mt">${esc(u.about)}</p>
          <h3 class="mt">Entry requirements</h3><p class="mt small">${esc(u.entry_requirements)}</p></div>
        <div class="card"><h3>Fast facts</h3>
          <ul class="plain mt"><li>Type: ${esc(u.university_type)}</li><li>Tuition: ${u.fees_per_year ? "$" + u.fees_per_year.toLocaleString() + " / year" : "Varies"}</li><li>Scholarships: ${u.scholarships ? "Available ✅" : "Limited"}</li></ul>
          <h3 class="mt">Strengths</h3><ul class="plain">${(u.strengths || []).map((s) => `<li>${esc(s)}</li>`).join("") || `<li class="muted">—</li>`}</ul>
          <button class="btn mt" id="readiness-btn">Check my readiness</button>
          <div id="readiness-result" class="mt"></div>
          <button class="btn-ghost mt" id="uni-detail-advice-btn">🤖 Ask Novi which is best</button>
          <div id="uni-detail-advice" class="mt"></div>
        </div>
      </div>`;
    view.querySelector("#readiness-btn").addEventListener("click", async () => {
      showLoader(true);
      try {
        const r = await api("/universities/readiness", { method: "POST", body: JSON.stringify({ university_id: u.id }) });
        document.querySelector("#readiness-result").innerHTML = `
          <div class="card" style="background:var(--panel-2)">
            <div class="between"><b>Readiness score</b><b style="color:${ringColor(r.readiness)}">${Math.round(r.readiness)}%</b></div>
            <div class="progress-track mt"><div class="progress-fill" style="width:${r.readiness}%;background:${ringColor(r.readiness)}"></div></div>
            <div class="small muted mt"><b style="color:var(--text)">Strengths</b><ul class="plain">${(r.strengths || []).map((s) => `<li>✅ ${esc(s)}</li>`).join("") || ""}</ul></div>
            <div class="small muted"><b style="color:var(--text)">Improvements</b><ul class="plain">${(r.improvements || []).map((s) => `<li>⚠️ ${esc(s)}</li>`).join("") || ""}</ul></div>
            <div class="small"><b style="color:var(--text)">Next steps</b><ul class="plain">${(r.next_steps || []).map((s) => `<li>→ ${esc(s)}</li>`).join("") || ""}</ul></div></div>`;
      } catch (ex) { toast(ex.message); }
      finally { showLoader(false); }
    });
    const dAdviceBtn = view.querySelector("#uni-detail-advice-btn"), dAdvice = view.querySelector("#uni-detail-advice");
    dAdviceBtn.addEventListener("click", async () => {
      dAdviceBtn.disabled = true; dAdviceBtn.textContent = "Novi is thinking…";
      dAdvice.innerHTML = `<div class="small muted">Novi is searching the web and comparing programs…</div>`;
      try {
        const adv = await api("/universities/advice", { method: "POST", body: JSON.stringify({ question: `Is ${u.name} the best fit for me?`, university_ids: [u.id] }) });
        const lines = String(adv.answer || "").split("\n").filter(Boolean);
        const sources = (adv.sources || []).filter((x) => x.uri);
        dAdvice.innerHTML = `
          <div class="row" style="gap:8px"><span class="novi-avatar">N</span><div style="flex:1">
            ${lines.map((l) => `<p class="small mb">${l}</p>`).join("")}
            ${sources.length ? `
              <div class="small muted mt"><b>Sources</b><ul class="plain">${sources.slice(0, 5).map((x) => `<li>🔗 <a href="${esc(x.uri)}" target="_blank" rel="noopener">${esc(x.title || x.domain || x.uri)}</a></li>`).join("")}</ul></div>` : ""}
          </div></div>`;
      } catch (ex) { dAdvice.innerHTML = `<p class="small" style="color:var(--bad)">${esc(ex.message)}</p>`; }
      dAdviceBtn.disabled = false; dAdviceBtn.textContent = "🤖 Ask Novi which is best";
    });
  } catch (ex) { view.innerHTML = emptyState("University not found", ex.message); }
  finally { showLoader(false); }
}

/* ---------------------------------------------------------------- roadmap v2 */
const STAGE_META = {
  discover: { icon: "🔍", label: "Discover Yourself", desc: "Interests, strengths and the foundation of your story." },
  explore: { icon: "🧭", label: "Explore & Experiment", desc: "Broaden horizons, test ideas and build habits." },
  build: { icon: "🛠️", label: "Build Your Profile", desc: "Create projects and evidence of your skill." },
  apply: { icon: "🚀", label: "Apply With Confidence", desc: "Applications, decisions and the next chapter." },
  foundations: { icon: "⚡", label: "Short-term · do this now", desc: "Your immediate next steps from what you told Novi." },
};
const PP_CATS = {
  projects: { icon: "🛠️", label: "Projects" },
  competitions: { icon: "🏆", label: "Competitions" },
  certifications: { icon: "🎓", label: "Certifications" },
  leadership: { icon: "🙌", label: "Leadership" },
  research: { icon: "🔬", label: "Research" },
  activities: { icon: "🎯", label: "Activities" },
  achievements: { icon: "⭐", label: "Achievements" },
};
function prettyDate(d) {
  if (!d) return "";
  const dt = new Date(String(d).length === 10 ? d + "T00:00:00" : d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

let _rmGoalId = null, _rmTaskFilter = "all";
async function renderRoadmap() {
  showLoader(true); view.innerHTML = "";
  const scrollY = window.scrollY;
  try {
    const [goals, priorities, tasks] = await Promise.all([
      api("/roadmap/goals").catch(() => []), api("/roadmap/priorities").catch(() => []), api("/roadmap/tasks").catch(() => []),
    ]);
    const activeGoals = (goals || []).filter((g) => g.status === "active");
    if (!activeGoals.some((g) => _rmGoalId && String(g.id) === String(_rmGoalId))) _rmGoalId = activeGoals.length ? activeGoals[0].id : null;
    const roadmap = await api("/roadmap" + (_rmGoalId ? `?goal_id=${_rmGoalId}` : "")).catch(() => ({ goal: null, stages: {}, progress_percent: 0 }));
    const stages = roadmap.stages || {};
    const shortTerm = roadmap.short_term || [];
    const gradeKeys = Object.keys(stages).filter((g) => (stages[g] || []).length).sort((a, b) => Number(a) - Number(b));
    const allItems = [...shortTerm, ...gradeKeys.flatMap((g) => stages[g])];
    const doneCount = allItems.filter((i) => i.completed).length;
    const pct = Math.round(roadmap.progress_percent || 0);
    const prioDone = (priorities || []).filter((p) => p.completed).length;
    const taskDone = (tasks || []).filter((t) => t.status === "done").length;
    const goal = roadmap.goal || null;
    const firstName = (state.user.first_name || state.user.name || "there").split(" ")[0];

    const gradeBlock = (grade) => {
      const items = stages[grade];
      const meta = STAGE_META[items[0]?.stage] || { icon: "🎯", label: "Your journey" };
      const gd = items.filter((i) => i.completed).length;
      const gp = items.length ? Math.round((gd / items.length) * 100) : 0;
      return `
        <div class="tl-grade">
          <div class="tl-grade-head">
            <div class="tl-grade-ico">${meta.icon}</div>
            <div style="flex:1;min-width:0">
              <div class="tl-grade-name">Grade ${esc(String(grade))} · ${esc(meta.label)}</div>
              <div class="tl-grade-sub small muted">${meta.desc || "Grow one step at a time."}</div>
            </div>
            <div class="tl-grade-pct"><b style="color:${ringColor(gp)}">${gp}%</b><span class="muted small">${gd}/${items.length}</span></div>
          </div>
          <div class="progress-track tl-progress"><div class="progress-fill" style="width:${gp}%"></div></div>
          <div class="tl-items">
            ${items.map((it) => `
              <div class="rm-item ${it.completed ? "done" : ""}" data-item="${it.id}">
                <label class="rm-check" title="${it.completed ? "Mark as not done" : "Mark done"}">
                  <input type="checkbox" ${it.completed ? "checked" : ""} data-toggle="${it.id}">
                  <span class="rm-checkbox">✓</span>
                </label>
                <div class="rm-body">
                  <div class="rm-top">
                    <b>${esc(it.title)}</b>
                    <span class="rm-stage stage-${esc(it.stage)}">${esc(it.stage)}</span>
                    ${it.completed ? `<span class="pill good">done</span>` : ""}
                  </div>
                  ${it.description ? `<p class="small muted rm-desc">${esc(it.description)}</p>` : ""}
                </div>
              </div>`).join("")}
          </div>
        </div>`;
    };

    const prioRows = (priorities || []).map((p) => `
      <div class="prio-row ${p.completed ? "done" : ""}">
        <label class="rm-check" title="Toggle priority"><input type="checkbox" ${p.completed ? "checked" : ""} data-prio="${p.id}"><span class="rm-checkbox">✓</span></label>
        <div class="prio-body">
          <b>${esc(p.title)}</b>
          <div class="small muted">${esc(p.skill_category)}${p.minutes ? " · " + p.minutes + " min" : ""}</div>
        </div>
      </div>`).join("");

    const taskRows = (tasks || []).filter((t) => _rmTaskFilter === "all" ? true : _rmTaskFilter === "done" ? t.status === "done" : t.status !== "done")
      .map((t) => `
      <div class="task-row ${t.status === "done" ? "done" : ""}">
        <label class="rm-check" title="Toggle task"><input type="checkbox" ${t.status === "done" ? "checked" : ""} data-task="${t.id}"><span class="rm-checkbox">✓</span></label>
        <div class="prio-body">
          <b>${esc(t.title)}</b>
          <div class="small muted">${esc(t.category)}${t.due_date ? " · due " + prettyDate(t.due_date) : ""}</div>
        </div>
      </div>`).join("");

    view.innerHTML = `
      <div class="hero">
        ${kicker(`Good ${bellTime()}, ${esc(firstName)} · your plan, sequenced`)}
        <h1>My <span class="grad">Roadmap</span></h1>
        <p>Goals become a grade-by-grade roadmap. Tick steps off — Novi carries your momentum forward.</p>
      </div>
      

      <div class="stats-strip">
        <div class="stat-mini"><span class="sm-ico">🎯</span><div><b>${activeGoals.length}</b><span>active goals</span></div></div>
        <div class="stat-mini"><span class="sm-ico">🗺️</span><div><b style="color:${ringColor(pct)}">${pct}%</b><span>roadmap done</span></div></div>
        <div class="stat-mini"><span class="sm-ico">✅</span><div><b>${prioDone}/${(priorities || []).length}</b><span>priorities</span></div></div>
        <div class="stat-mini"><span class="sm-ico">📋</span><div><b>${taskDone}/${(tasks || []).length}</b><span>tasks done</span></div></div>
      </div>

      <div class="rm-layout">
        <div class="rm-main">
          <div class="card mb">
            <div class="between">
              <h2>Goals</h2>
              <span class="pill mid">${activeGoals.length} active</span>
            </div>
            <div class="goal-tabs mt">
              ${activeGoals.map((g) => `
                <button class="goal-tab ${String(g.id) === String(_rmGoalId) ? "on" : ""}" data-goal="${g.id}">
                  <span class="gt-title">${esc(g.title)}</span>
                  <span class="pill">${esc(g.category)}</span>
                </button>`).join("")}
              <button class="goal-tab add" id="goal-add-toggle">＋ New goal</button>
            </div>
            <div id="goal-add-box" class="goal-add hidden">
              <input id="goal-title" placeholder="e.g. Get into a top AI university" style="flex:1;min-width:220px">
              <select id="goal-cat"><option value="career">Career</option><option value="university">University</option></select>
              <button class="btn" id="add-goal">Add</button>
              <button class="btn-ghost" id="goal-add-cancel">Cancel</button>
            </div>
          </div>

          <div class="card rm-head">
            <div class="between">
              <div style="min-width:0">
                ${goal ? `
                  <div class="rm-head-title"><h2>${esc(goal.title)}</h2>${pill(esc(goal.category), "mid")}${goal.status === "active" ? "" : pill(esc(goal.status), "good")}</div>
                  <div class="small muted mt">${doneCount} of ${allItems.length} steps completed${goal.description ? " · " + esc(goal.description) : ""}</div>`
                : `<h2>Your combined journey</h2><div class="small muted mt">${doneCount} of ${allItems.length} steps completed across all goals</div>`}
              </div>
              ${goal && goal.status === "active" ? `
                <div class="row">
                  ${allItems.length ? `<button class="btn-ghost small" id="rm-del" style="color:var(--bad)">delete</button>` : ""}
                  <button class="btn-ghost" id="rm-done">Mark done</button>
                  <button class="btn" id="rm-generate">✨ Generate roadmap</button>
                </div>` : ""}
            </div>
            ${goal && goal.status === "active" ? `
            <div class="row mt gen-box">
              <input id="rm-text" placeholder="What do you want? e.g. build an AI project and get into a top engineering college" style="flex:1;min-width:200px">
              <button class="btn" id="rm-gen-text">⚡ Make my plan</button>
            </div>` : ""}
            ${allItems.length ? `
              <div class="row between mt">
                <div class="progress-track" style="flex:1"><div class="progress-fill" style="width:${pct}%"></div></div>
                <b style="color:${ringColor(pct)}">${pct}%</b>
              </div>` : ""}
          </div>

          ${shortTerm.length ? `
          <div class="card" id="short-term-block">
            <div class="between">
              <div>
                <h2>⚡ Short-term · do this now</h2>
                <div class="small muted mt">${shortTerm.filter((i) => i.completed).length} of ${shortTerm.length} short-term steps done</div>
              </div>
              <span class="pill mid">now</span>
            </div>
            <div class="tl-items mt">
              ${shortTerm.map((it) => `
                <div class="rm-item ${it.completed ? "done" : ""}" data-item="${it.id}">
                  <label class="rm-check" title="${it.completed ? "Mark as not done" : "Mark done"}">
                    <input type="checkbox" ${it.completed ? "checked" : ""} data-toggle="${it.id}">
                    <span class="rm-checkbox">✓</span>
                  </label>
                  <div class="rm-body">
                    <div class="rm-top">
                      <b>${esc(it.title)}</b>
                      <span class="rm-stage stage-${esc(it.stage)}">${esc(it.stage)}</span>
                      ${it.completed ? `<span class="pill good">done</span>` : ""}
                    </div>
                    ${it.description ? `<p class="small muted rm-desc">${esc(it.description)}</p>` : ""}
                  </div>
                </div>`).join("")}
            </div>
          </div>` : ""}

          ${gradeKeys.length ? `
            <div class="timeline">${gradeKeys.map(gradeBlock).join("")}</div>
            <div class="legend-row">
              ${Object.entries(STAGE_META).map(([k, v]) => `<span class="rm-stage stage-${k}">${v.icon} ${esc(v.label)}</span>`).join(" ")}
            </div>`
          : (goal ? `
            <div class="card">
              <div class="between"><h3>No roadmap yet</h3><button class="btn" id="rm-generate-pty">✨ Generate your roadmap</button></div>
              <p class="small muted mt">Tell Novi your goal and it will map out a grade-by-grade plan in seconds.</p>
            </div>` : `
            <div class="card"><h3>Set your first goal to start your map</h3><p class="small muted mt">Tap <b>＋ New goal</b> above, then generate its roadmap.</p></div>`)}
        </div>

        <div class="rm-side">
          <div class="card">
            <div class="between"><h2>This week</h2><span class="pill mid">${prioDone}/${(priorities || []).length}</span></div>
            <p class="small muted mt">Priorities crafted for this week by Novi.</p>
            <button class="btn mt" id="prio-gen">✨ Generate with AI</button>
            <div id="prio-list" class="mt">
              ${prioRows || `<p class="small muted">No priorities yet — generate some above.</p>`}
            </div>
          </div>

          <div class="card">
            <div class="between"><h2>Tasks</h2><span class="pill mid">${taskDone}/${(tasks || []).length}</span></div>
            <div class="row mt">
              <input id="task-title" placeholder="New task…" style="flex:1">
              <select id="task-cat" style="width:auto"><option>build</option><option>explore</option><option>grow</option></select>
              <button class="btn" id="add-task">Add</button>
            </div>
            <div class="filter-tabs mt">
              ${[["all", `All · ${(tasks || []).length}`], ["active", `Active`], ["done", `Done · ${taskDone}`]].map(([k, l]) => `<button class="ft ${_rmTaskFilter === k ? "on" : ""}" data-ft="${k}">${l}</button>`).join("")}
            </div>
            <div id="task-list" class="mt">
              ${taskRows || `<p class="small muted">No tasks match this filter.</p>`}
            </div>
          </div>
        </div>
      </div>`;

    const reload = async (msg, keepScroll = true) => {
      const y = keepScroll ? window.scrollY : 0;
      await renderRoadmap();
      window.scrollTo(0, keepScroll ? y : 0);
      if (msg) toast(msg);
    };
    const addGoal = async () => {
      const t = view.querySelector("#goal-title").value.trim(); if (!t) return;
      showLoader(true);
      try { const g = await api("/roadmap/goals", { method: "POST", body: JSON.stringify({ title: t, category: view.querySelector("#goal-cat").value }) }); _rmGoalId = g.id; await reload("Goal added — generate its roadmap when you're ready ✨"); }
      catch (ex) { toast(ex.message); showLoader(false); }
    };
    view.querySelectorAll(".goal-tab[data-goal]").forEach((b) => b.addEventListener("click", () => { _rmGoalId = Number(b.dataset.goal); renderRoadmap(); }));
    const gAt = view.querySelector("#goal-add-toggle"); if (gAt) gAt.addEventListener("click", () => { view.querySelector("#goal-add-box").classList.toggle("hidden"); });
    const gAc = view.querySelector("#goal-add-cancel"); if (gAc) gAc.addEventListener("click", () => view.querySelector("#goal-add-box").classList.add("hidden"));
    const ag = view.querySelector("#add-goal"); if (ag) ag.addEventListener("click", addGoal);
    const gt = view.querySelector("#goal-title"); if (gt) gt.addEventListener("keydown", (e) => { if (e.key === "Enter") addGoal(); });
    view.querySelectorAll("#rm-generate, #rm-generate-pty").forEach((b) => b.addEventListener("click", async () => {
      showLoader(true);
      try { await api("/roadmap/generate", { method: "POST", body: JSON.stringify({ goal_id: _rmGoalId }) }); await renderRoadmap(); toast("Roadmap generated 🌱"); }
      catch (ex) { toast(ex.message); showLoader(false); }
    }));
    const rmGenText = view.querySelector("#rm-gen-text"); const rmText = view.querySelector("#rm-text");
    const genFromText = async () => {
      const t = (rmText.value || "").trim();
      if (!t) { toast("Tell Novi what you want first"); return; }
      showLoader(true);
      try { await api("/roadmap/generate", { method: "POST", body: JSON.stringify({ goal_id: _rmGoalId, text: t }) }); await renderRoadmap(); toast("Short-term + long-term roadmap generated 🌱"); }
      catch (ex) { toast(ex.message); showLoader(false); }
    };
    if (rmGenText) rmGenText.addEventListener("click", genFromText);
    if (rmText) rmText.addEventListener("keydown", (e) => { if (e.key === "Enter") genFromText(); });
    const rmDone = view.querySelector("#rm-done"); if (rmDone) rmDone.addEventListener("click", async () => {
      if (!confirm("Mark this goal as done?")) return;
      try { await api(`/roadmap/goals/${_rmGoalId}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }); toast("Goal complete — congratulations 🎉"); reload("", false); }
      catch (ex) { toast(ex.message); }
    });
    const rmDel = view.querySelector("#rm-del"); if (rmDel) rmDel.addEventListener("click", async () => {
      if (!confirm("Cancel this goal? Its roadmap items will be removed.")) return;
      try { await api(`/roadmap/goals/${_rmGoalId}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }); _rmGoalId = null; await reload("Goal cancelled", false); }
      catch (ex) { toast(ex.message); }
    });
    view.querySelectorAll(".tl-items").forEach((box) => box.addEventListener("change", async (e) => {
      const b = e.target.closest("[data-toggle]"); if (!b) return;
      b.indeterminate = false;
      await api(`/roadmap/items/${b.dataset.toggle}`, { method: "PATCH" });
      reload("Step updated ✓");
    }));
    view.querySelector("#prio-list").addEventListener("change", async (e) => {
      const b = e.target.closest("[data-prio]"); if (!b) return;
      await api(`/roadmap/priorities/${b.dataset.prio}`, { method: "PATCH" });
      reload("Priority updated ✓");
    });
    const pg = view.querySelector("#prio-gen"); if (pg) pg.addEventListener("click", async () => {
      pg.disabled = true; pg.textContent = "Thinking…";
      try { await api("/roadmap/priorities/generate", { method: "POST", body: JSON.stringify({}) }); await reload("Priorities refreshed for this week ✨"); }
      catch (ex) { toast(ex.message); pg.disabled = false; pg.textContent = "✨ Generate with AI"; }
    });
    view.querySelectorAll(".ft").forEach((b) => b.addEventListener("click", () => { _rmTaskFilter = b.dataset.ft; renderRoadmap(); }));
    const addTaskBtn = view.querySelector("#add-task"); if (addTaskBtn) addTaskBtn.addEventListener("click", async () => {
      const t = view.querySelector("#task-title").value.trim(); if (!t) return;
      showLoader(true);
      try { await api("/roadmap/tasks", { method: "POST", body: JSON.stringify({ title: t, category: view.querySelector("#task-cat").value }) }); await reload("Task added ✓"); }
      catch (ex) { toast(ex.message); showLoader(false); }
    });
    const tt = view.querySelector("#task-title"); if (tt) tt.addEventListener("keydown", (e) => { if (e.key === "Enter") addTaskBtn.click(); });
    if (view.querySelector("#task-list")) view.querySelector("#task-list").addEventListener("change", async (e) => {
      const b = e.target.closest("[data-task]"); if (!b) return;
      const togglingTo = e.target.checked ? "done" : "active";
      await api(`/roadmap/tasks/${b.dataset.task}`, { method: "PATCH", body: JSON.stringify({ status: togglingTo }) });
      reload("Task updated ✓");
    });
  } catch (ex) { view.innerHTML = emptyState("Roadmap unavailable", ex.message); }
  finally { showLoader(false); window.scrollTo(0, scrollY); }
}

/* ---------------------------------------------------------------- passport v3 (LinkedIn-style profile) */
let _ppFilter = "all", _ppEditing = null, _ppCache = [];
async function renderPassport() {
  showLoader(true); view.innerHTML = "";
  try {
    const [dctx, items, comp] = await Promise.all([
      getDnaContext(), api("/passport").catch(() => []), api("/passport/completion").catch(() => ({ score: 0 })),
    ]);
    _ppCache = items;
    const firstName = (state.user.first_name || state.user.name || "Student");
    const lastName = state.user.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();
    const byCat = (c) => items.filter((i) => i.category === c);
    const verifiedCount = items.filter((i) => i.verified).length;
    const covered = Object.keys(comp.by_category || {}).filter((c) => (comp.by_category[c] || 0) > 0);
    const skillSet = [...new Set(items.flatMap((i) => (i.skills || []).map((s) => String(s).trim()).filter(Boolean)))];
    const dnaFocus = (dctx && (dctx.label || dctx.top_zone)) || comp.dna_focus || "";
    const skillPool = skillSet.length ? skillSet.slice(0, 12) : (dctx && (dctx.skills || []).slice(0, 6) || []);
    const score = comp.score || 0;
    const editing = _ppEditing ? items.find((i) => i.id === _ppEditing) : null;
    const avatar = (state.user && state.user.avatar) || "";
    const avatarHTML = avatar
      ? `<img src="${esc(avatar)}" alt="Profile photo">`
      : `<span class="ln-avatar-initials">${initials(fullName)}</span>`;

    const lnEntry = (i) => {
      const cat = PP_CATS[i.category] || { icon: "⭐", label: i.category };
      return `
      <div class="ln-entry ${i.verified ? "ln-verified" : ""}" data-pp-id="${i.id}">
        <div class="ln-entry-ico">${cat.icon}</div>
        <div class="ln-entry-body">
          <div class="ln-entry-top">
            <div class="ln-entry-title">${esc(i.title)}
              ${i.verified ? `<span class="ln-badge" title="Verified by Novi">✓</span>` : ""}
            </div>
            <div class="ln-entry-actions">
              <button class="btn-ghost tiny" data-pp-edit="${i.id}">Edit</button>
              <button class="btn-ghost tiny danger" data-pp-del="${i.id}">Delete</button>
            </div>
          </div>
          <div class="ln-entry-meta">
            <span>${cat.label}</span>
            ${i.date_achieved ? `<span class="dot"></span><span>📅 ${prettyDate(i.date_achieved)}</span>` : ""}
            ${i.certificate_url ? `<span class="dot"></span><a href="${esc(i.certificate_url)}" target="_blank" rel="noopener">Proof ↗</a>` : ""}
          </div>
          ${i.description ? `<p class="ln-entry-desc">${esc(i.description)}</p>` : ""}
          ${(i.skills || []).length ? `<div class="tag-list" style="margin:6px 0 0">${i.skills.map((s) => `<span class="chip acc">${esc(s)}</span>`).join("")}</div>` : ""}
        </div>
      </div>`;
    };

    const filtered = _ppFilter === "all" ? items : items.filter((i) => i.category === _ppFilter);
    const formTitle = editing ? "Edit entry" : "Add to your passport";

    view.innerHTML = `
      <div class="hero">
        ${kicker("Your evidence of growth")}
        <h1>My Career <span class="grad">Passport</span></h1>
        <p>Every project, win and experience that proves your potential — one polished portfolio of proof.</p>
      </div>
      

      <div class="ln-profile">
        <div class="ln-cover">
          <div class="ln-cover-bg"></div>
          <span class="ln-cover-tag">NOVI · PASSION TO PROOF</span>
        </div>
        <div class="ln-avatar-wrap">
          <div class="ln-avatar">${avatarHTML}</div>
          <button class="ln-camera" id="ln-camera" title="${avatar ? "Change photo" : "Add a photo"}">📷</button>
          <input type="file" id="ln-file" accept="image/*" hidden>
        </div>
        <div class="ln-head">
          <div class="ln-id">
            <h1 class="ln-name">${esc(firstName)} ${lastName ? `<span class="grad">${esc(lastName)}</span>` : ""}</h1>
            <div class="ln-headline">${esc(headlineFor(dctx, comp))}</div>
            <div class="ln-loc">
              ${state.user.school ? `<span>🏫 ${esc(state.user.school)}</span>` : ""}
              ${state.user.grade ? `<span class="dot"></span><span>Grade ${esc(state.user.grade)}</span>` : ""}
              <span class="dot"></span><span>Career Passport</span>
            </div>
          </div>
          <div class="ln-cta">
            <button class="btn ln-refresh" id="ln-refresh">↻ Refresh from chat</button>
            <button class="btn-ghost" id="ln-add">＋ Add achievement</button>
          </div>
        </div>
        <div class="ln-stats">
          ${stat("Entries", items.length, "normal")}
          ${stat("Verified", verifiedCount, "good")}
          ${stat("Categories", covered.length, "accent")}
          ${stat("Skills", skillPool.length, "warn")}
          <div class="ln-score-cell">
            ${ringHTML(score, Math.round(score) + "%", 74)}
            <span class="ln-score-label">profile score</span>
          </div>
        </div>
      </div>

      <div class="ln-grid">
        <div class="ln-main">
          <div class="ln-section">
            <div class="ln-section-head">
              <div>
                <h2 class="ln-section-title">${_ppFilter === "all" ? "All achievements" : (PP_CATS[_ppFilter] ? PP_CATS[_ppFilter].label : "Achievements")}</h2>
                <p class="small muted">${items.length} ${items.length === 1 ? "entry" : "entries"} on your profile</p>
              </div>
              <div class="pf-tabs" style="margin:0">
                <button class="cat-pill ${_ppFilter === "all" ? "on" : ""}" data-cat="all">All · ${items.length}</button>
                ${Object.entries(PP_CATS).map(([k, v]) => `<button class="cat-pill ${_ppFilter === k ? "on" : ""}" data-cat="${k}">${v.icon} ${v.label} · ${byCat(k).length}</button>`).join("")}
              </div>
            </div>

            <div class="card pf-form ln-form" id="pf-form">
              <div class="between"><h2>${formTitle}</h2>${editing ? `<button class="btn-ghost small" id="pp-cancel">Cancel</button>` : ""}</div>
              <div class="cols mt" style="gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
                <div class="field" style="margin:0"><label>Category</label>
                  <select id="pp-cat">${Object.entries(PP_CATS).map(([k, v]) => `<option value="${k}" ${editing && editing.category === k ? "selected" : ""}>${v.icon} ${v.label}</option>`).join("")}</select></div>
                <div class="field" style="margin:0"><label>Date achieved (optional)</label><input id="pp-date" type="date" value="${editing && editing.date_achieved ? (editing.date_achieved || "") : ""}"></div>
              </div>
              <div class="field mt"><label>Title</label><input id="pp-title" placeholder="e.g. National Robotics finalist" value="${editing ? esc(editing.title) : ""}"></div>
              <div class="field"><label>Description</label><textarea id="pp-desc" placeholder="What did you do, and what did it take?">${editing ? esc(editing.description || "") : ""}</textarea></div>
              <div class="row" style="gap:12px;align-items:flex-end">
                <div class="field" style="flex:1;margin:0"><label>Skills (comma separated)</label><input id="pp-skills" placeholder="python, data analysis, leadership" value="${editing ? esc((editing.skills || []).join(", ")) : ""}"></div>
                <button class="btn" id="pp-save">${editing ? "Save changes" : "Add to passport"}</button>
              </div>
            </div>

            <div id="pf-feed" class="ln-feed">
              ${filtered.length ? filtered.map(lnEntry).join("") : `
                <div class="card empty" style="grid-column:1/-1">
                  <h3>Nothing here yet</h3>
                  <p class="small muted mt">Add your first ${_ppFilter === "all" ? "achievement" : (PP_CATS[_ppFilter] ? PP_CATS[_ppFilter].label.toLowerCase() : "entry")} — or hit “Refresh from chat” and Novi will scan your chats for proof to add.</p>
                </div>`}
            </div>
          </div>
        </div>

        <aside class="ln-rail">
          <div class="card ln-card">
            <div class="ln-card-head"><span class="ln-ico">🧬</span><h3>Profile summary</h3></div>
            ${comp.novi_note ? `<p class="small">${esc(comp.novi_note)}</p>` : `<p class="small muted">The more proof you add, the clearer your story becomes for universities.</p>`}
            ${comp.suggested_next ? `<div class="ln-next mt"><span class="ln-ico">🎯</span><span class="small"><b style="color:var(--accent-2)">${esc(comp.suggested_next)}</b></span></div>` : ""}
            ${dnaFocus ? `<div class="ln-focus"><span class="small muted">Direction</span><div class="chip acc">${esc(dnaFocus)}</div></div>` : ""}
          </div>

          <div class="card ln-card">
            <div class="ln-card-head"><span class="ln-ico">✨</span><h3>Profile strengths</h3></div>
            ${skillPool.length ? `<div class="tag-list" style="margin:0">${skillPool.map((s) => `<span class="chip acc">✦ ${esc(s)}</span>`).join("")}</div>` : `<p class="small muted">Skills you add to entries appear here — your profile’s “toolkit”.</p>`}
          </div>

          <div class="card ln-card">
            <div class="ln-card-head"><span class="ln-ico">🗺️</span><h3>Proof coverage</h3></div>
            ${Object.entries(PP_CATS).map(([k, v]) => `
              <div class="ln-bar-row">
                <span>${v.icon} ${v.label}</span>
                <div class="ln-bar"><div class="ln-bar-fill ${byCat(k).length ? "has" : ""}" style="width:${Math.max(6, Math.min(100, (byCat(k).length / 3) * 100))}%"></div></div>
                <b>${byCat(k).length}</b>
              </div>`).join("")}
          </div>
        </aside>
      </div>`;

    function stat(label, n, tone) {
      const colors = { normal: "var(--text)", good: "var(--good)", accent: "var(--accent-2)", warn: "var(--warn)" };
      return `<div class="ln-stat"><b style="color:${colors[tone]}">${n}</b><span>${label}</span></div>`;
    }

    const resetForm = () => { _ppEditing = null; renderPassport(); };
    const save = async () => {
      const payload = {
        category: view.querySelector("#pp-cat").value,
        title: view.querySelector("#pp-title").value.trim(),
        description: view.querySelector("#pp-desc").value.trim(),
        date_achieved: view.querySelector("#pp-date").value || null,
        skills: view.querySelector("#pp-skills").value.split(",").map((s) => s.trim()).filter(Boolean),
      };
      if (!payload.title) { toast("A title is required", "err"); return; }
      showLoader(true);
      try {
        if (_ppEditing) { await api(`/passport/items/${_ppEditing}`, { method: "PATCH", body: JSON.stringify(payload) }); toast("Entry updated ✓"); }
        else { await api("/passport/items", { method: "POST", body: JSON.stringify(payload) }); toast("Added to your passport ✨"); }
        _ppEditing = null; await renderPassport();
      } catch (ex) { toast(ex.message); showLoader(false); }
    };
    view.querySelector("#pp-save").addEventListener("click", save);
    view.querySelector("#pp-title").addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    const ppCancel = view.querySelector("#pp-cancel"); if (ppCancel) ppCancel.addEventListener("click", resetForm);
    view.querySelectorAll(".pf-tabs .cat-pill").forEach((b) => b.addEventListener("click", () => { _ppFilter = b.dataset.cat; renderPassport(); }));

    const lnCamera = view.querySelector("#ln-camera"), lnFile = view.querySelector("#ln-file");
    lnCamera.addEventListener("click", () => lnFile.click());
    lnFile.addEventListener("change", async () => {
      const file = lnFile.files && lnFile.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) { toast("Please choose an image file", "err"); return; }
      try {
        const resized = await resizeImage(file, 240);
        showLoader(true);
        const me = await api("/auth/me", { method: "PATCH", body: JSON.stringify({ avatar: resized }) });
        state.user = me; localStorage.setItem("novi_user", JSON.stringify(state.user));
        toast("Profile photo updated ✨"); await renderPassport();
      } catch (ex) { toast(ex.message); showLoader(false); }
    });

    view.querySelector("#ln-refresh").addEventListener("click", async () => {
      const btn = view.querySelector("#ln-refresh");
      btn.disabled = true; btn.innerHTML = "Scanning your chats…";
      try {
        const r = await api("/passport/refresh", { method: "POST" });
        if (r.added > 0) toast(`Novi found ${r.added} new ${r.added === 1 ? "entry" : "entries"} from your chats ✨`);
        else toast(r.total >= 3 ? "No new achievements found in your chats" : "Chat a little more first, then refresh again", "info");
        await renderPassport();
      } catch (ex) { toast(ex.message, "err"); }
      finally { if (view.querySelector("#ln-refresh")) { view.querySelector("#ln-refresh").disabled = false; view.querySelector("#ln-refresh").innerHTML = "↻ Refresh from chat"; } }
    });

    view.querySelector("#ln-add").addEventListener("click", () => {
      const form = view.querySelector("#pf-form");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      form.classList.toggle("ln-form-open");
      const t = view.querySelector("#pp-title");
      if (t && form.classList.contains("ln-form-open")) t.focus();
    });

    view.querySelector("#pf-feed").addEventListener("click", async (e) => {
      const del = e.target.closest("[data-pp-del]");
      if (del) {
        if (!confirm("Remove this entry from your passport?")) return;
        try { await api(`/passport/items/${del.dataset.ppDel}`, { method: "DELETE" }); toast("Entry removed"); await renderPassport(); }
        catch (ex) { toast(ex.message); }
        return;
      }
      const edit = e.target.closest("[data-pp-edit]");
      if (edit) { _ppEditing = Number(edit.dataset.ppEdit); renderPassport(); if (view.querySelector("#pp-title")) { view.querySelector("#pp-title").focus(); } }
    });
  } catch (ex) { view.innerHTML = emptyState("Passport unavailable", ex.message); }
  finally { showLoader(false); }
}

function headlineFor(dctx, comp) {
  const focus = (dctx && (dctx.label || dctx.top_zone)) || comp.dna_focus || "";
  const base = focus ? `${focus}` : "Career";
  return `${base} · proving my potential, one project at a time`;
}

async function resizeImage(file, maxSize) {
  const raw = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = raw; });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/* ---------------------------------------------------------------- contribution graph (GitHub-style) */
const GH_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function _localISO(d) { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function _ghKindLabel(day) {
  if (!day.level || day.level <= 0) return "No check-in";
  const parts = [];
  if (day.kind === "daily" || day.kind === "both") parts.push("Daily check-in");
  if (day.kind === "weekly" || day.kind === "both") parts.push("Weekly reflection");
  if (!parts.length) return `Logged in · ${day.count} pt`;
  return `${parts.join(" + ")} · ${day.count} ${day.count === 1 ? "point" : "points"}`;
}
function contributionGraphHTML(g) {
  const weeks = g.weeks || [];
  const s = g.stats || {};
  if (!weeks.length) return "";
  const nWeeks = weeks.length;
  const todayIso = _localISO(new Date());

  let cells = "", idx = 0;
  const monthMarkers = [], yearMarkers = [];
  weeks.forEach((week, wi) => {
    week.days.forEach((day) => {
      const d = new Date(day.date + "T00:00:00");
      const isToday = day.date === todayIso;
      if (d.getDate() === 1) {
        const key = day.date.slice(0, 7);
        let span = 0;
        for (let i = wi; i < nWeeks; i++) { if (weeks[i].days.some((x) => x.date.startsWith(key))) span++; else break; }
        monthMarkers.push({ wi, label: GH_MONTHS[d.getMonth()], span, key });
        if (d.getMonth() === 0) {
          let yspan = 0;
          for (let i = wi; i < nWeeks; i++) { if (weeks[i].days.some((x) => new Date(x.date + "T00:00:00").getFullYear() === d.getFullYear())) yspan++; else break; }
          yearMarkers.push({ wi, label: String(d.getFullYear()), span: yspan });
        }
      }
      const wShort = d.toLocaleDateString("en-US", { weekday: "short" });
      const nice = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const cellIdx = Math.min(idx, 40);
      cells += `<div class="gh-cell l${day.level}${day.kind ? " k-" + day.kind : ""}${isToday ? " gh-today" : ""}" style="--i:${cellIdx}" title="${esc(day.note || day.date)}" data-date="${esc(day.date)}" data-day="${esc(nice)}" data-w="${wShort}" data-kind="${esc(_ghKindLabel(day))}"></div>`;
      idx++;
    });
  });

  const spacer = (arr, n) => { const out = []; for (let wi = 0; wi < n; wi++) { const m = arr.find((x) => x.wi === wi); out.push(m ? `<div class="gh-month${m.label.length > 4 ? " long" : ""}" style="grid-column:${wi + 1} / span ${m.span}">${m.label}</div>` : ""); } return out.join(""); };
  const yearCells = [];
  for (let wi = 0; wi < nWeeks; wi++) { const y = yearMarkers.find((x) => x.wi === wi); yearCells.push(y ? `<div class="gh-year" style="grid-column:${wi + 1} / span ${y.span}">${y.label}</div>` : ""); }

  const dayLabels = [["0", "Mon"], ["2", "Wed"], ["4", "Fri"]];
  const activeDays = weeks.reduce((a, w) => a + w.days.reduce((b, dd) => b + (dd.level > 0 ? 1 : 0), 0), 0);
  return `
    <div class="card gh-card">
      <div class="gh-head">
        <div>
          <h2>🔥 Consistency streak</h2>
          <p class="small muted mt">Every square is a day you checked in. <b class="muted" style="color:var(--text)">${activeDays}</b> active ${activeDays === 1 ? "day" : "days"} across the last ${nWeeks} weeks — daily check-ins plus weekly reflections.</p>
        </div>
        <div class="gh-stats">
          <div class="gh-stat"><b>${esc(pluck(s, "current_streak"))}</b><span>day streak</span></div>
          <div class="gh-stat"><b>${esc(pluck(s, "best_streak"))}</b><span>best streak</span></div>
          <div class="gh-stat"><b>${esc(pluck(s, "active_days"))}</b><span>active days</span></div>
          <div class="gh-stat"><b>${esc(pluck(s, "weekly_done"))}</b><span>weekly done</span></div>
        </div>
      </div>
      <div class="gh-wrap" style="--gh-weeks:${nWeeks}">
        <div class="gh-years">${yearCells.join("")}</div>
        <div class="gh-months">${spacer(monthMarkers, nWeeks)}</div>
        <div class="gh-body">
          <div class="gh-days">${dayLabels.map(([r, lbl]) => `<span style="grid-row:${(+r) + 1}">${lbl}</span>`).join("")}</div>
          <div class="gh-grid">${cells}</div>
          <div class="gh-pop"></div>
        </div>
        <div class="gh-legend"><span class="small muted">Less</span>${[0, 1, 2, 3, 4].map((l) => `<div class="gh-cell l${l}"></div>`).join("")}<span class="small muted">More</span></div>
      </div>
      <div class="gh-hint small muted">Each day earns points for the fields you fill in (focus, done, mood, energy) — finishing your weekly reflection colors the whole week. Hover any square to see the date.</div>
    </div>`;
}
function pluck(o, k) { return o && o[k] !== undefined && o[k] !== null ? o[k] : 0; }

function attachGraphTooltips(root) {
  const body = root.querySelector(".gh-body");
  const pop = body ? body.querySelector(".gh-pop") : null;
  if (!body || !pop) return;
  body.addEventListener("mouseover", (e) => {
    const cell = e.target.closest(".gh-cell");
    if (!cell || !cell.dataset.day) return;
    pop.innerHTML = `<b>${esc(cell.dataset.w)} · ${esc(cell.dataset.day)}</b><span>${esc(cell.dataset.kind)}</span>`;
    pop.style.opacity = "1";
  });
  body.addEventListener("mousemove", (e) => {
    if (pop.style.opacity !== "1") return;
    const r = body.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    let x = (e.clientX - r.left) - pr.width / 2;
    x = Math.max(6, Math.min(r.width - pr.width - 6, x));
    let y = (e.clientY - r.top) - pr.height - 12;
    if (y < 4) y = (e.clientY - r.top) + 16;
    pop.style.left = x + "px";
    pop.style.top = y + "px";
  });
  body.addEventListener("mouseout", (e) => {
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".gh-body")) return;
    pop.style.opacity = "0";
  });
}

/* ---------------------------------------------------------------- check-in */
async function renderCheckin() {
  showLoader(true); view.innerHTML = "";
  try {
    const [cur, history, contrib] = await Promise.all([
      api("/checkins/current"),
      api("/checkins").catch(() => []),
      api("/checkins/graph").catch(() => null),
    ]);
    const ai = cur.ai_summary && typeof cur.ai_summary === "object" ? cur.ai_summary : null;
    view.innerHTML = `
      <div class="hero">${kicker("Your weekly pulse")}<h1>Weekly Check-in</h1><p>Your weekly pulse with Novi — honest answers make your mentoring sharper.</p></div>
      
      ${contrib ? contributionGraphHTML(contrib) : ""}
      <div class="card mb">
        <div class="between"><h2>This week · ${esc(cur.week_start || "")}</h2>${cur.status ? pill(esc(cur.status), "mid") : ""}</div>
        ${ai ? `
          <div class="novi-box mt">
            <span class="novi-avatar">N</span>
            <span class="small">${ai.dna_alignment ? `<b>DNA tie-in.</b> ${esc(ai.dna_alignment)}` : esc("Novi has summarised your week.")}</span>
            <div class="row mt">
              ${((ai.new_skills || []).slice(0, 3)).map((s) => `<span class="chip">${esc(s)}</span>`).join("")}
              ${((ai.milestones || []).slice(0, 3)).map((s) => `<span class="chip acc">${esc(s)}</span>`).join("")}
            </div>
          </div>` : ""}
      </div>
      <div class="ck-layout">
        <div class="ck-form">
          <div class="checkin-grid">
            ${[["accomplishments", "What did you accomplish this week?", "e.g. Finished my Python project"], ["learnings", "What did you learn?", "e.g. Pandas for data analysis"], ["challenges", "What was challenging?", "e.g. Balancing tests and coding"], ["pride", "What are you proud of?", "e.g. Led a team demo"], ["next_week", "What would you do better next week?", "e.g. Start my AI project proposal"]].map(([k, l, ph]) => `
              <div class="card"><h3>${l}</h3><textarea class="mt" data-ck="${k}" style="min-height:110px" placeholder="${ph}">${esc(cur[k] || "")}</textarea></div>`).join("")}
            <div class="card"><h3>Mood</h3>
              <input type="hidden" data-ck="mood" value="${esc(cur.mood || "")}">
              <div class="mood-grid mt">${Object.keys(MOODS).map((m) => `<button type="button" class="mood-btn ${cur.mood === m ? "on" : ""}" data-mood="${m}">${moodIcon(m)} ${m}</button>`).join("")}</div></div>
            <div class="card"><h3>Energy (1-10)</h3><input type="number" min="1" max="10" class="mt" data-ck="energy" value="${cur.energy || ""}"></div>
          </div>
          <div class="row mt">
            <button class="btn" id="ck-save">Save check-in</button>
            <button class="btn-ghost" id="ck-summarize">Summarize with AI</button>
          </div>
        </div>
        <div class="card ck-history">
          <h2>History</h2>
          ${(history || []).length ? history.map((h) => `
            <div class="list-item mb">
              <div class="between"><b>${esc(h.week_start || ("Week " + (h.week_number || "")))}</b>${pill(esc(h.status || "—"), "mid")}</div>
              ${h.accomplishments ? `<div class="small muted mt" style="margin-top:2px">${esc(String(h.accomplishments).slice(0, 90))}</div>` : ""}
            </div>`).join("") : `<p class="small muted">No previous check-ins.</p>`}
        </div>
      </div>`;
    attachGraphTooltips(view);
    const collect = () => {
      const p = {};
      view.querySelectorAll("[data-ck]").forEach((el) => { const v = el.value; if (v) p[el.dataset.ck] = el.dataset.ck === "mood" ? v : el.dataset.ck === "energy" ? Number(v) : String(v); });
      return p;
    };
    view.querySelector("#ck-save").addEventListener("click", async () => {
      showLoader(true);
      try { await api("/checkins", { method: "POST", body: JSON.stringify(collect()) }); toast("Check-in saved ✓"); renderCheckin(); }
      catch (ex) { toast(ex.message); showLoader(false); }
    });
    view.querySelector("#ck-summarize").addEventListener("click", async () => {
      showLoader(true);
      try { await api("/checkins/summarize", { method: "POST" }); renderCheckin(); }
      catch (ex) { toast(ex.message); showLoader(false); }
    });
    view.querySelectorAll(".mood-btn").forEach((b) => b.addEventListener("click", () => {
      view.querySelectorAll(".mood-btn").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      view.querySelector('[data-ck="mood"]').value = b.dataset.mood;
    }));
  } catch (ex) { view.innerHTML = emptyState("Check-in unavailable", ex.message); }
  finally { showLoader(false); }
}

/* ---------------------------------------------------------------- parent */
async function renderOverview() {
  showLoader(true); view.innerHTML = "";
  try {
    const d = await api("/parents/dashboard");
    const cStat = (c, k) => (c[k] !== undefined && c[k] !== null ? c[k] : null);
    const pct = (v) => typeof v === "number" ? `${Math.round(v)}%` : v;
    view.innerHTML = `
      <div class="hero"><h1>Parent Overview</h1><p>Follow your child's universe of growth — without hovering.</p></div>
      <div class="card mb">
        <h2>Link a student</h2><p class="small muted">Enter the email your child signed up with.</p>
        <div class="row mt"><input id="link-email" placeholder="child@school.edu" style="flex:1;max-width:360px"><button class="btn" id="link-btn">Link</button></div>
      </div>
      <div class="section-title">Children</div>
      ${(d.children || []).length ? d.children.map((c) => `
        <div class="card mb">
          <div class="between"><h2>${esc(c.name)} <span class="muted" style="font-weight:400">· Grade ${esc(c.grade || "—")}</span></h2>
            ${c.career_direction ? pill(esc(c.career_direction) === "On Track" ? "On track 🟢" : esc(c.career_direction) === "Needs Focus" ? "Needs focus ⚠️" : esc(c.career_direction) + " 🔭", "mid") : ""}</div>
          <div class="cols mt">
            ${[["profile_strength", "Profile strength"], ["university_readiness", "University readiness"]].map(([k, n]) => {
              const v = cStat(c, k);
              return `<div class="card" style="background:var(--panel-2)"><div class="between"><span class="small muted">${n}</span><b style="color:${typeof v === "number" ? ringColor(v) : "var(--text)"}">${pct(v)}</b></div><div class="progress-track mt progress-sm"><div class="progress-fill" style="width:${typeof v === "number" ? v : 0}%;background:${typeof v === "number" ? ringColor(v) : "var(--muted)"}"></div></div></div>`;
            }).join("")}
          </div>
          ${(c.month_focus || []).length ? `<div class="small muted mt">Focus areas: ${c.month_focus.map((f) => `<span class="chip">${esc(f)}</span>`).join(" ")}</div>` : ""}
          ${c.insight ? `<div class="novi-box mt"><span class="novi-avatar">N</span>${esc(c.insight)}</div>` : ""}
        </div>`).join("") : emptyState("No children linked yet", "Link your child above to begin following their journey.")}
      ${d.insight ? `<div class="card novi-box mt"><span class="novi-avatar">N</span>${esc(d.insight)}</div>` : ""}`;
    view.querySelector("#link-btn").addEventListener("click", async () => {
      const email = view.querySelector("#link-email").value.trim(); if (!email) return;
      try { await api("/parents/link", { method: "POST", body: JSON.stringify({ student_email: email }) }); toast("Linked ✓"); renderOverview(); }
      catch (ex) { toast(ex.message); }
    });
  } catch (ex) { view.innerHTML = emptyState("Overview unavailable", ex.message); }
  finally { showLoader(false); }
}

async function renderAdvisor() {
  showLoader(true); view.innerHTML = "";
  view.innerHTML = `
    <div class="hero"><h1>Parent Advisor</h1><p>Ask Novi for calm, evidence-based guidance about your child's journey.</p></div>
    <div class="card">
      <div class="field"><label>Ask Novi</label><textarea id="adv-q" placeholder="How can I support my child around exam stress?" style="min-height:100px"></textarea></div>
      <button class="btn" id="adv-btn">Ask Novi</button>
      <div id="adv-answer" class="mt"></div>
    </div>`;
  view.querySelector("#adv-btn").addEventListener("click", async () => {
    const q = view.querySelector("#adv-q").value.trim(); if (!q) return;
    showLoader(true);
    try {
      const r = await api("/parents/advisor", { method: "POST", body: JSON.stringify({ question: q }) });
      view.querySelector("#adv-answer").innerHTML = `<div class="novi-box"><span class="novi-avatar">N</span>${esc(r.answer)}</div>`;
    } catch (ex) { toast(ex.message); }
    finally { showLoader(false); }
  });
  showLoader(false);
}

/* ---------------------------------------------------------------- boot */
document.getElementById("logout-btn").addEventListener("click", logout);

init();