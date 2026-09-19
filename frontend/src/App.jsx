import { useEffect } from "react";
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, LogOut } from "lucide-react";
import { useAuth, AuthProvider } from "./auth";
import { initials, warmRoute, warmAllRoutes } from "./api";
import { Loader, toast, ToastHost } from "./ui";

import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import ChatPage from "./pages/ChatPage";
import DnaPage from "./pages/DnaPage";
import CareersPage from "./pages/CareersPage";
import CareerDetailPage from "./pages/CareerDetailPage";
import UniversitiesPage from "./pages/UniversitiesPage";
import UniversityDetailPage from "./pages/UniversityDetailPage";
import RoadmapPage from "./pages/RoadmapPage";
import PassportPage from "./pages/PassportPage";
import CheckinPage from "./pages/CheckinPage";
import ProfilePage from "./pages/ProfilePage";
import OverviewPage from "./pages/OverviewPage";
import AdvisorPage from "./pages/AdvisorPage";

const studentNav = [
  ["dashboard", "Dashboard"], ["chat", "Chat"], ["dna", "My DNA"],
  ["careers", "Careers"], ["universities", "Universities"],
  ["roadmap", "Roadmap"], ["passport", "Passport"], ["checkin", "Check-in"],
  ["profile", "Profile"],
];
const parentNav = [["overview", "Overview"], ["advisor", "Parent Advisor"]];

function Gate({ page, children }) {
  const { user } = useAuth();
  const isParent = user && user.role === "parent";
  const allowed = isParent
    ? (page === "overview" || page === "advisor")
    : (page !== "overview" && page !== "advisor");
  if (!allowed) return <Navigate to={isParent ? "/overview" : "/dashboard"} replace />;
  return children;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = user && user.role === "parent" ? parentNav : studentNav;
  const name = user?.first_name || user?.name || user?.email || "NOVI";
  const grade = user?.grade ? `Grade ${user.grade}` : "";
  return (
    <header id="topbar" className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 16.5 9.2 10l4 3.2L19.5 5" />
            <path d="M15.2 5H19.5v4.3" />
          </svg>
        </span>
        <span className="brand-copy">
          <span className="brand-name">NOVI</span>
          <span className="brand-tag">Your Success OS</span>
        </span>
      </div>

      <nav id="nav" className="nav">
        {items.map(([key, label]) => (
          <NavLink
            key={key}
            to={`/${key}`}
            className={({ isActive }) => (isActive ? "active" : "")}
            onMouseEnter={() => warmRoute(key)}
            onPointerDown={() => warmRoute(key)}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="topbar-right">
        <button className="tb-chat" title="Chat with Novi" onClick={() => navigate("/chat")}>
          <MessageCircle size={19} strokeWidth={1.8} />
        </button>
        <div className="topbar-user" id="topbar-user">
          <span className="tb-avatar">{initials(name)}</span>
          <span className="tb-copy">
            <span className="tb-name">{name}</span>
            {grade ? <span className="tb-grade">{grade}</span> : null}
          </span>
        </div>
        <button className="logout-btn" title="Log out" onClick={() => { logout(); toast("Signed out — see you soon 👋", "info"); }}>
          <LogOut size={18} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}

function Shell() {
  const { token } = useAuth();
  const location = useLocation();
  useEffect(() => { warmAllRoutes(); }, []);
  const isChat = location.pathname === "/chat";
  return (
    <div className="app">
      <Topbar />
      <main id="view" className={`view${isChat ? " chat-page" : ""}`}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/dashboard" element={<Gate page="dashboard"><DashboardPage /></Gate>} />
          <Route path="/chat" element={<Gate page="chat"><ChatPage /></Gate>} />
          <Route path="/dna" element={<Gate page="dna"><DnaPage /></Gate>} />
          <Route path="/careers" element={<Gate page="careers"><CareersPage /></Gate>} />
          <Route path="/career/:slug" element={<Gate page="careers"><CareerDetailPage /></Gate>} />
          <Route path="/universities" element={<Gate page="universities"><UniversitiesPage /></Gate>} />
          <Route path="/university/:slug" element={<Gate page="universities"><UniversityDetailPage /></Gate>} />
          <Route path="/roadmap" element={<Gate page="roadmap"><RoadmapPage /></Gate>} />
          <Route path="/passport" element={<Gate page="passport"><PassportPage /></Gate>} />
          <Route path="/checkin" element={<Gate page="checkin"><CheckinPage /></Gate>} />
          <Route path="/profile" element={<Gate page="profile"><ProfilePage /></Gate>} />
          <Route path="/overview" element={<Gate page="overview"><OverviewPage /></Gate>} />
          <Route path="/advisor" element={<Gate page="advisor"><AdvisorPage /></Gate>} />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </main>
      {token ? null : null}
    </div>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user && user.role === "parent" ? "/overview" : "/dashboard"} replace />;
}

function Root() {
  const { token, ready } = useAuth();
  if (!ready) return (
    <div id="root">
      <div className="app"><Loader /></div>
      <ToastHost />
    </div>
  );
  if (!token) return (
    <div id="root">
      <Loader />
      <div className="app logged-out">
        <main id="view" className="view"><AuthPage /></main>
      </div>
      <ToastHost />
    </div>
  );
  return (
    <div id="root">
      <Loader />
      <Shell />
      <ToastHost />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <ScrollToTop />
        <Root />
      </HashRouter>
    </AuthProvider>
  );
}