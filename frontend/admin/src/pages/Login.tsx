import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

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
      navigate("/settings");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Admin sign in</h1>
        <p>Use your work credentials. Access requires an admin role.</p>

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
          </>
        )}

        <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}
