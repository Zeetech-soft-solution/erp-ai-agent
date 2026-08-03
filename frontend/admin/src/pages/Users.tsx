import { useEffect, useState } from "react";
import { api } from "../api/client";

interface StoredUser {
  userEmail: string;
  apiKey: string;
  provisionedBy: string;
  updatedAt: string;
}

/**
 * Provisioning screen: admin generates an API key/secret FOR a user in
 * ERPNext (that user's profile -> API Access -> Generate Keys) and
 * pastes it here. Validated against ERPNext before it's stored — see
 * routes/admin.routes.ts. The secret is never shown again after saving;
 * this list only ever displays metadata.
 */
export function Users() {
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    api.getUsers().then((r) => setUsers(r.users)).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.setUserCredential(email, apiKey, apiSecret);
      setEmail(""); setApiKey(""); setApiSecret("");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(userEmail: string) {
    if (!confirm(`Revoke the stored credential for ${userEmail}? They'll fall back to session-based login until re-provisioned.`)) return;
    await api.revokeUserCredential(userEmail);
    load();
  }

  return (
    <div className="main">
      <h1 className="page-title">User credentials</h1>
      <p className="page-subtitle">
        Provision a persistent API key for a user so the agent can act on their behalf without
        requiring a live password login every time. Generate the key on their connected-system profile
        (API Access → Generate Keys), then paste it below — it's validated against the connected system and
        encrypted before storage; the secret is never displayed again after saving.
      </p>

      <form className="card" onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="setting-input" style={{ width: "100%" }} placeholder="user@company.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="setting-input" style={{ width: "100%" }} placeholder="API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
        <input className="setting-input" style={{ width: "100%" }} placeholder="API secret" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} required />
        <button className="save-btn" type="submit" disabled={saving} style={{ alignSelf: "flex-start" }}>
          {saving ? "Validating & saving…" : "Provision credential"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>

      <div className="card">
        {users.map((u) => (
          <div className="card-row" key={u.userEmail}>
            <div>
              <p className="setting-label">{u.userEmail}</p>
              <p className="setting-desc">Provisioned by {u.provisionedBy} · updated {new Date(u.updatedAt).toLocaleString()}</p>
              <p className="setting-key">key: {u.apiKey}</p>
            </div>
            <button className="save-btn" style={{ background: "transparent", color: "#A32D2D", borderColor: "#A32D2D" }} onClick={() => handleRevoke(u.userEmail)}>
              Revoke
            </button>
          </div>
        ))}
        {!users.length && <p className="setting-desc">No credentials provisioned yet.</p>}
      </div>
    </div>
  );
}
