import { useEffect, useState } from "react";
import { api } from "../api/client";

interface StoredUser {
  userEmail: string;
  apiKey: string;
  provisionedBy: string;
  updatedAt: string;
}

interface UserSettingDef {
  key: string;
  label: string;
  description: string | null;
  value_type: "string" | "number" | "boolean" | "password" | "url" | "select";
  category: string;
  placeholder: string | null;
  options: string[] | null;
}

const CATEGORY_ORDER = ["email", "support", "projplan", "policy"];
const CATEGORY_LABELS: Record<string, string> = {
  email: "Email",
  support: "Support portal",
  projplan: "Project planning",
  policy: "Policy",
};

const SAVE_DISABLED_MESSAGE =
  "Not authorized to save yet — per-user settings aren't wired to the agent, so saving is disabled for now.";

function validateUserSetting(s: UserSettingDef, raw: any): string | null {
  if (s.value_type === "number" && raw !== "" && Number.isNaN(Number(raw))) return `${s.label} must be a number.`;
  if (s.value_type === "url" && raw && !/^https?:\/\/.+/i.test(String(raw))) return `${s.label} must start with http:// or https://.`;
  if (s.value_type === "select" && s.options && raw && !s.options.includes(raw)) return `${s.label} must be one of: ${s.options.join(", ")}.`;
  return null;
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

  const [userDefs, setUserDefs] = useState<UserSettingDef[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [userValues, setUserValues] = useState<Record<string, any>>({});
  const [userDrafts, setUserDrafts] = useState<Record<string, any>>({});
  const [userFieldError, setUserFieldError] = useState<Record<string, string>>({});
  const [userSavingKey, setUserSavingKey] = useState<string | null>(null);
  const [userSettingsError, setUserSettingsError] = useState("");

  function load() {
    api.getUsers().then((r) => setUsers(r.users)).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  useEffect(() => {
    api.getUserSettingDefs().then((r) => setUserDefs(r.defs)).catch((e) => setUserSettingsError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedEmail) { setUserValues({}); return; }
    setUserDrafts({});
    setUserFieldError({});
    api
      .getUserSettingValues(selectedEmail)
      .then((r) => {
        const byKey: Record<string, any> = {};
        for (const v of r.values) byKey[v.key] = v.value;
        setUserValues(byKey);
      })
      .catch((e) => setUserSettingsError(e.message));
  }, [selectedEmail]);

  function userDraftFor(def: UserSettingDef) {
    if (def.key in userDrafts) return userDrafts[def.key];
    if (def.key in userValues) return userValues[def.key];
    return def.value_type === "boolean" ? false : "";
  }

  function saveUserSetting(def: UserSettingDef) {
    setUserSettingsError("");
    const raw = userDraftFor(def);
    const problem = validateUserSetting(def, raw);
    if (problem) {
      setUserFieldError({ ...userFieldError, [def.key]: problem });
      return;
    }
    setUserFieldError({ ...userFieldError, [def.key]: "" });
    setUserSavingKey(def.key);
    setTimeout(() => {
      setUserSavingKey(null);
      setUserSettingsError(SAVE_DISABLED_MESSAGE);
    }, 400);
  }

  const userGrouped = CATEGORY_ORDER.map((cat) => ({ cat, defs: userDefs.filter((d) => d.category === cat) })).filter(
    (g) => g.defs.length
  );

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
      <p className="page-subtitle">Provision an API key so the agent can act as this person without a live login every time.</p>

      <form className="card" onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="setting-input" style={{ width: "100%" }} placeholder="user@company.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="setting-input" style={{ width: "100%" }} placeholder="API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
        <input className="setting-input" style={{ width: "100%" }} placeholder="API secret" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} required />
        <button className="save-btn" type="submit" disabled={saving} style={{ alignSelf: "flex-start" }}>
          {saving ? "Validating & saving…" : "Provision credential"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>

      {users.length ? (
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
              {users.map((u) => (
                <tr key={u.userEmail}>
                  <td>{u.userEmail}</td>
                  <td className="setting-key">{u.apiKey}</td>
                  <td>{u.provisionedBy}</td>
                  <td>{new Date(u.updatedAt).toLocaleString()}</td>
                  <td>
                    <button className="save-btn" style={{ background: "transparent", color: "#A32D2D", borderColor: "#A32D2D" }} onClick={() => handleRevoke(u.userEmail)}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="setting-desc">No credentials provisioned yet.</p>
      )}

      <h1 className="page-title" style={{ marginTop: 32 }}>Per-user settings</h1>
      <p className="page-subtitle">
        Email, support-portal, project-planning, and policy preferences for one specific person — not an
        org-wide value. Pick a user below; nothing is read by the agent yet, saving is disabled the same
        way as Global Settings.
      </p>

      <div className="card">
        <div className="card-row">
          <div>
            <p className="setting-label">User</p>
            <p className="setting-desc">Pick a provisioned user, or type any email to configure someone new</p>
          </div>
          <input
            className="setting-input"
            style={{ width: 280 }}
            list="known-users"
            placeholder="user@company.com"
            value={selectedEmail}
            onChange={(e) => setSelectedEmail(e.target.value)}
          />
          <datalist id="known-users">
            {users.map((u) => <option key={u.userEmail} value={u.userEmail} />)}
          </datalist>
        </div>
      </div>

      {selectedEmail &&
        userGrouped.map(({ cat, defs }) => (
          <div key={cat} style={{ marginTop: 24 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
              {CATEGORY_LABELS[cat] || cat}
            </h2>
            <div className="card">
              {defs.map((d) => (
                <div className="card-row" key={d.key}>
                  <div>
                    <p className="setting-label">{d.label}</p>
                    {d.description && <p className="setting-desc">{d.description}</p>}
                    <p className="setting-key">{d.key}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {d.value_type === "boolean" ? (
                        <select
                          className="setting-input"
                          value={String(userDraftFor(d))}
                          onChange={(e) => setUserDrafts({ ...userDrafts, [d.key]: e.target.value === "true" })}
                        >
                          <option value="true">On</option>
                          <option value="false">Off</option>
                        </select>
                      ) : d.value_type === "select" ? (
                        <select
                          className="setting-input"
                          value={userDraftFor(d)}
                          onChange={(e) => setUserDrafts({ ...userDrafts, [d.key]: e.target.value })}
                        >
                          {!userDraftFor(d) && <option value="">Select…</option>}
                          {(d.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input
                          className="setting-input"
                          type={d.value_type === "password" ? "password" : d.value_type === "number" ? "number" : d.value_type === "url" ? "url" : "text"}
                          placeholder={d.placeholder || undefined}
                          value={userDraftFor(d)}
                          onChange={(e) => setUserDrafts({ ...userDrafts, [d.key]: e.target.value })}
                        />
                      )}
                      <button className="save-btn" disabled={userSavingKey === d.key} onClick={() => saveUserSetting(d)}>
                        {userSavingKey === d.key ? "Saving…" : "Save"}
                      </button>
                    </div>
                    {userFieldError[d.key] && <p className="error-text" style={{ margin: 0 }}>{userFieldError[d.key]}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

      {userSettingsError && <p className="error-text" style={{ marginTop: 16 }}>{userSettingsError}</p>}
    </div>
  );
}
