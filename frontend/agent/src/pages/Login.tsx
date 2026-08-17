import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

/**
 * Two login modes, both resulting in the SAME thing server-side: a
 * credential that lets the agent act AS this person on ERPNext, never
 * as a shared service account. Password is the familiar path; API key
 * avoids typing a password into a third-party app and sidesteps any
 * 2FA conflict, see docs/ARCHITECTURE.md for the tradeoffs.
 */

const DEMO_PASSWORD = "Sunrise@123";

interface DemoUser {
  name: string;
  email: string;
  department: string;
  role: string;
  access: string;
}

/**
 * This tier grants one role's worth of real tool access — Sales User
 * (see config/roles.policy.ts): leads, contacts, opportunities,
 * customers, and territories, the CRM sample this build demonstrates.
 * Rahul Menon carries that role on the live demo company and is the
 * account this page signs a demo visitor in as.
 */
const DEMO_USERS: DemoUser[] = [
  {
    name: "Rahul Menon",
    email: "rahul.menon66@sunriseelectronics.example.in",
    department: "Sales & Marketing",
    role: "Sales Manager",
    access: "Leads, opportunities, contacts, customers & territories",
  },
];

// The actual ERPNext instance the agent talks to, a dedicated subdomain
// rather than a noviz.in subpath, because Frappe generates root-relative
// URLs (/app, /assets, /login, /api) that a path prefix can't cleanly
// contain without colliding with this site's own root-level paths.
const ERP_URL = "https://sunrise.noviz.in";

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ErpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <ellipse cx="8" cy="3.2" rx="5.2" ry="1.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.8 3.2v9.6c0 1 2.3 1.8 5.2 1.8s5.2-.8 5.2-1.8V3.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.8 8c0 1 2.3 1.8 5.2 1.8s5.2-.8 5.2-1.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function Login() {
  const [mode, setMode] = useState<"password" | "apikey">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
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

  async function loginAsDemo(demoEmail: string) {
    setError("");
    setDemoLoading(demoEmail);
    try {
      const result = await api.loginWithPassword(demoEmail, DEMO_PASSWORD);
      api.setToken(result.token);
      navigate("/chat");
    } catch (err: any) {
      setError(err.message || "Login failed");
      setDemoLoading(null);
    }
  }

  // Copying never closes the modal, only the close button (or clicking
  // outside it) does that, so someone can copy several accounts in a row.
  async function copyEmail(demoEmail: string) {
    try {
      await navigator.clipboard.writeText(demoEmail);
      setCopiedEmail(demoEmail);
      setTimeout(() => setCopiedEmail((current) => (current === demoEmail ? null : current)), 1500);
    } catch {
      // Clipboard API can be unavailable (e.g. plain-HTTP access), the
      // email is still fully visible/selectable by hand, so just no-op.
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Sign in to ERP Agent</h1>
        <p>Use your own work identity. Every action you take is recorded as you, not a shared account.</p>

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
            <p className="login-hint">Generate this in your connected system's admin settings (e.g. your user profile, under API Access).</p>
          </>
        )}

        <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        {error && <p className="error-text">{error}</p>}
      </form>

      <button type="button" className="demo-trigger-btn" onClick={() => setShowDemo(true)}>
        View demo credentials
      </button>

      <a className="erp-live-card" href={ERP_URL} target="_blank" rel="noopener noreferrer">
        <span className="erp-live-icon">
          <ErpIcon />
        </span>
        <span className="erp-live-text">
          <span className="erp-live-title">Login to Live ERP</span>
          <span className="erp-live-sub">The real ERP system behind this demo. Same accounts, same data.</span>
        </span>
      </a>

      {showDemo && (
        <div className="demo-modal-overlay" onClick={() => setShowDemo(false)}>
          <div className="demo-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Demo credentials">
            <button type="button" className="demo-modal-close" onClick={() => setShowDemo(false)} aria-label="Close">
              ✕
            </button>
            <h2>Demo credentials</h2>
            <p>
              A real account on the live demo company, scoped to its own role. Password: <code>{DEMO_PASSWORD}</code>
            </p>

            <div className="demo-user-list">
              {DEMO_USERS.map((u) => (
                <div className="demo-user-row" key={u.email}>
                  <div className="demo-user-main">
                    <div className="demo-user-top">
                      <span className="demo-user-name">{u.name}</span>
                      <span className="demo-role-tag">{u.role}</span>
                    </div>
                    <div className="demo-user-dept">{u.department}</div>
                    <div className="demo-user-access">{u.access}</div>
                    <div className="demo-user-email-row">
                      <span className="demo-user-email">{u.email}</span>
                      <button
                        type="button"
                        className="demo-copy-btn"
                        onClick={() => copyEmail(u.email)}
                        title="Copy email"
                        aria-label={`Copy ${u.name}'s email`}
                      >
                        {copiedEmail === u.email ? <CheckIcon /> : <CopyIcon />}
                        {copiedEmail === u.email ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="action-btn small demo-signin-btn"
                    disabled={demoLoading !== null}
                    onClick={() => loginAsDemo(u.email)}
                  >
                    {demoLoading === u.email ? "Signing in…" : "Sign in"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <a className="admin-console-card" href="/agent-admin/" target="_blank" rel="noopener noreferrer">
        Admin console
      </a>
    </div>
  );
}
