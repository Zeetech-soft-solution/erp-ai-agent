import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

/**
 * Two login modes, both resulting in the SAME thing server-side: a
 * credential that lets the agent act AS this person on ERPNext, never
 * as a shared service account. Password is the familiar path; API key
 * avoids typing a password into a third-party app and sidesteps any
 * 2FA conflict — see docs/ARCHITECTURE.md for the tradeoffs.
 */
export function Login() {
  const [mode, setMode] = useState<"password" | "apikey">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result =
        mode === "password" ? await api.loginWithPassword(email, password) : await api.loginWithApiKey(email, apiKey, apiSecret);
      api.setToken(result.token);
      navigate("/chat");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Sign in</h1>
        <p>Use your own work identity — every action you take is recorded as you, not a shared account.</p>

        <div className="login-mode-toggle">
          <button type="button" className={mode === "password" ? "active" : ""} onClick={() => setMode("password")}>
            Password
          </button>
          <button type="button" className={mode === "apikey" ? "active" : ""} onClick={() => setMode("apikey")}>
            API key
          </button>
        </div>

        <input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />

        {mode === "password" ? (
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        ) : (
          <>
            <input placeholder="API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
            <input placeholder="API secret" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} required />
            <p className="login-hint">Generate this in your connected system's admin settings (e.g. your user profile → API Access).</p>
          </>
        )}

        <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}
