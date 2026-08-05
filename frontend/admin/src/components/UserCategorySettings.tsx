import { useEffect, useState } from "react";
import { api } from "../api/client";

interface UserSettingDef {
  key: string;
  label: string;
  description: string | null;
  value_type: "string" | "number" | "boolean" | "password" | "url" | "select";
  category: string;
  placeholder: string | null;
  options: string[] | null;
}

const SAVE_DISABLED_MESSAGE =
  "Not authorized to save yet — per-user settings aren't wired to the agent, so saving is disabled for now.";

function validateUserSetting(s: UserSettingDef, raw: any): string | null {
  if (s.value_type === "number" && raw !== "" && Number.isNaN(Number(raw))) return `${s.label} must be a number.`;
  if (s.value_type === "url" && raw && !/^https?:\/\/.+/i.test(String(raw))) return `${s.label} must start with http:// or https://.`;
  if (s.value_type === "select" && s.options && raw && !s.options.includes(raw)) return `${s.label} must be one of: ${s.options.join(", ")}.`;
  return null;
}

/**
 * Shared shell for every per-user settings tab (Email, Support,
 * Project planning, ...) — one category per page, same picker + field
 * layout + save-guard everywhere. Fields are ALWAYS visible (with
 * placeholders) even before a user is picked; entering/selecting an
 * email just loads that person's saved values into the same fields
 * rather than revealing them for the first time.
 */
export function UserCategorySettings({ category, title, subtitle }: { category: string; title: string; subtitle: string }) {
  const [knownEmails, setKnownEmails] = useState<string[]>([]);
  const [defs, setDefs] = useState<UserSettingDef[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [values, setValues] = useState<Record<string, any>>({});
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getUsers().then((r) => setKnownEmails(r.users.map((u: any) => u.userEmail))).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .getUserSettingDefs()
      .then((r) => setDefs(r.defs.filter((d: UserSettingDef) => d.category === category)))
      .catch((e) => setError(e.message));
  }, [category]);

  useEffect(() => {
    setDrafts({});
    setFieldError({});
    if (!selectedEmail) { setValues({}); return; }
    api
      .getUserSettingValues(selectedEmail)
      .then((r) => {
        const byKey: Record<string, any> = {};
        for (const v of r.values) byKey[v.key] = v.value;
        setValues(byKey);
      })
      .catch((e) => setError(e.message));
  }, [selectedEmail]);

  function draftFor(def: UserSettingDef) {
    if (def.key in drafts) return drafts[def.key];
    if (def.key in values) return values[def.key];
    return def.value_type === "boolean" ? false : "";
  }

  function save(def: UserSettingDef) {
    setError("");
    const raw = draftFor(def);
    const problem = validateUserSetting(def, raw);
    if (problem) {
      setFieldError({ ...fieldError, [def.key]: problem });
      return;
    }
    setFieldError({ ...fieldError, [def.key]: "" });
    setSavingKey(def.key);
    setTimeout(() => {
      setSavingKey(null);
      setError(SAVE_DISABLED_MESSAGE);
    }, 400);
  }

  const listId = `known-users-${category}`;

  return (
    <div className="main">
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{subtitle}</p>

      <div className="card">
        <div className="card-row">
          <div>
            <p className="setting-label">User</p>
            <p className="setting-desc">Pick a provisioned user, or type any email to configure someone new</p>
          </div>
          <input
            className="setting-input"
            style={{ width: 280 }}
            list={listId}
            placeholder="user@company.com"
            value={selectedEmail}
            onChange={(e) => setSelectedEmail(e.target.value)}
          />
          <datalist id={listId}>
            {knownEmails.map((e) => <option key={e} value={e} />)}
          </datalist>
        </div>
      </div>

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
                    value={String(draftFor(d))}
                    onChange={(e) => setDrafts({ ...drafts, [d.key]: e.target.value === "true" })}
                  >
                    <option value="true">On</option>
                    <option value="false">Off</option>
                  </select>
                ) : d.value_type === "select" ? (
                  <select
                    className="setting-input"
                    value={draftFor(d)}
                    onChange={(e) => setDrafts({ ...drafts, [d.key]: e.target.value })}
                  >
                    {!draftFor(d) && <option value="">Select…</option>}
                    {(d.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    className="setting-input"
                    type={d.value_type === "password" ? "password" : d.value_type === "number" ? "number" : d.value_type === "url" ? "url" : "text"}
                    placeholder={d.placeholder || undefined}
                    value={draftFor(d)}
                    onChange={(e) => setDrafts({ ...drafts, [d.key]: e.target.value })}
                  />
                )}
                <button className="save-btn" disabled={savingKey === d.key} onClick={() => save(d)}>
                  {savingKey === d.key ? "Saving…" : "Save"}
                </button>
              </div>
              {fieldError[d.key] && <p className="error-text" style={{ margin: 0 }}>{fieldError[d.key]}</p>}
            </div>
          </div>
        ))}
        {!defs.length && !error && <p className="setting-desc">Loading…</p>}
      </div>

      {error && <p className="error-text" style={{ marginTop: 16 }}>{error}</p>}
    </div>
  );
}
