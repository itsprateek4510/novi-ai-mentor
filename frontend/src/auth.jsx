import { createContext, useContext, useEffect, useState } from "react";
import { api, clearApiCache, setApiToken, resetWarmAll } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("novi_token") || null);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("novi_user") || "null"); } catch (_) { return null; }
  });
  const [ready, setReady] = useState(false);

  const login = (tk, u) => {
    localStorage.setItem("novi_token", tk);
    localStorage.setItem("novi_user", JSON.stringify(u));
    setApiToken(tk);
    setToken(tk);
    setUser(u);
    resetWarmAll();
    clearApiCache();
  };

  const logout = () => {
    localStorage.removeItem("novi_token");
    localStorage.removeItem("novi_user");
    setApiToken(null);
    setToken(null);
    setUser(null);
    resetWarmAll();
    clearApiCache();
  };

  const patchUser = (u) => {
    localStorage.setItem("novi_user", JSON.stringify(u));
    setUser(u);
  };

  useEffect(() => {
    if (!token) { setReady(true); return; }
    setApiToken(token);
    api("/auth/me")
      .then((me) => {
        localStorage.setItem("novi_user", JSON.stringify(me));
        setUser(me);
      })
      .catch(() => { logout(); })
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = { token, user, ready, login, logout, patchUser };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() { return useContext(AuthCtx); }