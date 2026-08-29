import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useSession } from "../context/SessionContext";

interface StoredUser {
  userEmail: string;
  apiKey: string;
  provisionedBy: string;
  updatedAt: string;
}

// Shown only when there are zero real credentials, so the table never
// looks broken/empty — clearly marked as a sample row, not real data,
// and not part of the `users` state so it can never be "revoked".
const SAMPLE_ROW = {
  userEmail: "demo.user@yourcompany.com",
  apiKey: "demo_ak_7f3a9c21b6",
  provisionedBy: "—",
  updatedAt: "",
};

/**
 * Provisioning screen: admin generates an API key/secret FOR a user in
 * the connected system (that user's profile -> API Access -> Generate
 * Keys) and pastes it here. Validated before it's stored — see
 * routes/admin.routes.ts. The secret is never shown again after saving;
 * this list only ever displays metadata.
 */
export function Users() {
  const { isDemo } = useSession();
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [erpGeneratesKeys, setErpGeneratesKeys] = useState(true);
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    api.getUsers().then((r) => setUsers(r.users)).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  useEffect(() => {
    api
      .getSettings()
      .then((r) => {
        const row = r.settings.find((s: any) => s.key === "erp_supports_api_key_generation");
        if (row) setErpGeneratesKeys(Boolean(row.value));
      })
      .catch(() => {});
  }, []);

  const provisioningDisabled = isDemo || erpGeneratesKeys;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (provisioningDisabled) return;
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
    if (isDemo) return;
    if (!confirm(`Revoke the stored credential for ${userEmail}? They'll fall back to session-based login until re-provisioned.`)) return;
    await api.revokeUserCredential(userEmail);
    load();
  }

  const showingSample = users.length === 0;
  const rows = showingSample ? [SAMPLE_ROW] : users;

  return (
    <div className="main">
      <h1 className="page-title">User credentials</h1>
      <p className="page-subtitle">Provision an API key so the agent can act as this person without a live login every time.</p>

      {erpGeneratesKeys ? (
        <p className="setting-desc" style={{ marginBottom: 16 }}>
          The connected system generates its own API keys (see Global settings → "Connected ERP generates its own API keys") —
          manual provisioning is disabled. Generate a key on that user's own profile instead; it becomes visible below automatically
          once wired.
        </p>
      ) : (
        <form className="card" onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input className="setting-input" style={{ width: "100%" }} placeholder="user@company.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isDemo} required />
          <input className="setting-input" style={{ width: "100%" }} placeholder="API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={isDemo} required />
          <input className="setting-input" style={{ width: "100%" }} placeholder="API secret" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} disabled={isDemo} required />
          <button className="save-btn" type="submit" disabled={saving || provisioningDisabled} style={{ alignSelf: "flex-start" }}>
            {saving ? "Validating & saving…" : "Provision credential"}
          </button>
          {isDemo && <p className="setting-desc">Demo login — viewing only, provisioning is disabled.</p>}
          {error && <p className="error-text">{error}</p>}
        </form>
      )}

      {showingSample && <p className="setting-desc">No credentials provisioned yet — showing a sample row below.</p>}

      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Key</th>
              <th>Provisioned by</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.userEmail} style={showingSample ? { opacity: 0.6, fontStyle: "italic" } : undefined}>
                <td>{u.userEmail}</td>
                <td className="setting-key">{u.apiKey}</td>
                <td>{u.provisionedBy}</td>
                <td>{u.updatedAt ? new Date(u.updatedAt).toLocaleString() : "—"}</td>
                <td>
                  {!showingSample && !isDemo && (
                    <button className="save-btn" style={{ background: "transparent", color: "#A32D2D", borderColor: "#A32D2D" }} onClick={() => handleRevoke(u.userEmail)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
