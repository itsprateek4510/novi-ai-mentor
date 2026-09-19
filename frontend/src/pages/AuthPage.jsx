import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { showLoader } from "../ui";

export default function AuthPage() {
  const { login } = useAuth();
  const [loginErr, setLoginErr] = useState("");
  const [signupErr, setSignupErr] = useState("");
  const [role, setRole] = useState("student");

  const handleLogin = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    setLoginErr("");
    showLoader(true);
    try {
      const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }) });
      login(res.access_token, res.user);
    } catch (ex) { setLoginErr(ex.message); }
    finally { showLoader(false); }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    setSignupErr("");
    showLoader(true);
    try {
      const res = await api("/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          password: fd.get("password"),
          role,
          school: fd.get("school") || null,
          grade: fd.get("grade") ? Number(fd.get("grade")) : null,
        }),
      });
      login(res.access_token, res.user);
    } catch (ex) { setSignupErr(ex.message); }
    finally { showLoader(false); }
  };

  const field = (name, label, ph, type = "text") => (
    <div className="field">
      <label>{label}</label>
      <input name={name} type={type} placeholder={ph} />
    </div>
  );

  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        <div className="auth-hero">
          <div className="brand-mark">N</div>
          <h1>Your AI mentor.<br />Your journey.<br />Your future.</h1>
          <p>The Operating System for Student Success — guiding you from Grade 9 to your dream university.</p>
        </div>

        <div className="card">
          <h2>Welcome back</h2>
          {loginErr ? <div className="error-banner">{loginErr}</div> : null}
          <form data-login-form className="mt" onSubmit={handleLogin}>
            {field("email", "Email", "you@school.edu", "email")}
            {field("password", "Password", "Your password", "password")}
            <button className="btn" style={{ width: "100%" }}>Log in</button>
          </form>
        </div>

        <div className="auth-divider"><span>New here? Create your account</span></div>

        <div className="card">
          <div className="between"><h2>Create account</h2>
            <select name="signup-role" className="role-select" style={{ width: "auto" }} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="student">Student</option>
              <option value="parent">Parent</option>
            </select>
          </div>
          {signupErr ? <div className="error-banner mt">{signupErr}</div> : null}
          <form data-signup-form className="mt" onSubmit={handleSignup}>
            {field("name", "Full name", "Your name")}
            {role === "student" ? <div data-student-only>{field("grade", "Grade", "e.g. 11")}</div> : null}
            {field("school", "School", "Your school")}
            {field("email", "Email", "you@school.edu", "email")}
            {field("password", "Password (6+ chars)", "Create a password", "password")}
            <button className="btn" style={{ width: "100%" }}>Create account</button>
          </form>
        </div>
      </div>
    </div>
  );
}