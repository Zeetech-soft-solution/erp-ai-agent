import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useSession } from "../context/SessionContext";

interface Setting {
  key: string;
  value: any;
  label: string;
  description: string | null;
  value_type: "string" | "number" | "boolean" | "password" | "url" | "select";
  category: string;
  placeholder: string | null;
  options: string[] | null;
}

// Display order and section copy — categories not listed here (there
// shouldn't be any) fall back to their raw key, title-cased.
const CATEGORY_ORDER = ["general", "email"];
const CATEGORY_LABELS: Record<string, { title: string; subtitle: string }> = {
  general: { title: "General", subtitle: "Core operational knobs for the agent app." },
  email: { title: "Email (SMTP)", subtitle: "The org's one outgoing mail server — not per-person." },
};
// Support/project-planning settings moved to per-user settings pages
// (db/migrations/010_user_settings.sql) — those are one value per
// PERSON, not one org-wide value, so they don't belong here. Policy
// settings moved to the Policy Documents page itself
// (011_remove_global_policy_settings.sql). Email (SMTP) and the LLM
// provider/key/base-URL fields (012_llm_and_erp_settings.sql) stay
// global — one shared config for the whole org, not per-person.

function validate(s: Setting, raw: any): string | null {
  if (s.value_type === "number" && raw !== "" && Number.isNaN(Number(raw))) {
    return `${s.label} must be a number.`;
  }
  if (s.value_type === "url" && raw && !/^https?:\/\/.+/i.test(String(raw))) {
    return `${s.label} must start with http:// or https://.`;
  }
  if (s.value_type === "select" && s.options && raw && !s.options.includes(raw)) {
    return `${s.label} must be one of: ${s.options.join(", ")}.`;
  }
  return null;
}

export function Settings() {
  const { isDemo } = useSession();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  function load() {
    api.getSettings().then((r) => setSettings(r.settings)).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  function draftFor(s: Setting) {
    return s.key in drafts ? drafts[s.key] : s.value;
  }

  async function save(s: Setting) {
    setError("");
    setSavedKey(null);
    const raw = draftFor(s);
    const problem = validate(s, raw);
    if (problem) {
      setFieldError({ ...fieldError, [s.key]: problem });
      return;
    }
    setFieldError({ ...fieldError, [s.key]: "" });

    if (isDemo) {
      setError("Demo login — viewing only, saving is disabled.");
      return;
    }

    const value = s.value_type === "number" ? Number(raw) : s.value_type === "boolean" ? Boolean(raw) : raw;
    setSavingKey(s.key);
    try {
      await api.updateSetting(s.key, value);
      setDrafts((d) => { const next = { ...d }; delete next[s.key]; return next; });
      setSettings((rows) => rows.map((r) => (r.key === s.key ? { ...r, value } : r)));
      setSavedKey(s.key);
      setTimeout(() => setSavedKey((k) => (k === s.key ? null : k)), 1500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingKey(null);
    }
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({ cat, rows: settings.filter((s) => s.category === cat) })).filter(
    (g) => g.rows.length
  );
  const otherCats = [...new Set(settings.map((s) => s.category))].filter((c) => !CATEGORY_ORDER.includes(c));
  for (const cat of otherCats) grouped.push({ cat, rows: settings.filter((s) => s.category === cat) });

  return (
    <div className="main">
      <h1 className="page-title">Global settings</h1>

      {grouped.map(({ cat, rows }) => {
        const meta = CATEGORY_LABELS[cat] || { title: cat, subtitle: "" };
        return (
          <div key={cat} style={{ marginTop: 24 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, margin: "0 0 2px" }}>{meta.title}</h2>
            {meta.subtitle && <p className="page-subtitle" style={{ margin: "0 0 10px" }}>{meta.subtitle}</p>}

            <div className="card">
              {rows.map((s) => (
                <div className="card-row" key={s.key}>
                  <div>
                    <p className="setting-label">{s.label}</p>
                    {s.description && <p className="setting-desc">{s.description}</p>}
                    <p className="setting-key">{s.key}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {s.value_type === "boolean" ? (
                        <select
                          className="setting-input"
                          value={String(draftFor(s))}
                          onChange={(e) => setDrafts({ ...drafts, [s.key]: e.target.value === "true" })}
                        >
                          <option value="true">On</option>
                          <option value="false">Off</option>
                        </select>
                      ) : s.value_type === "select" ? (
                        <select
                          className="setting-input"
                          value={draftFor(s)}
                          onChange={(e) => setDrafts({ ...drafts, [s.key]: e.target.value })}
                        >
                          {!draftFor(s) && <option value="">Select…</option>}
                          {(s.options || []).map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="setting-input"
                          type={s.value_type === "password" ? "password" : s.value_type === "number" ? "number" : s.value_type === "url" ? "url" : "text"}
                          placeholder={s.placeholder || undefined}
                          value={draftFor(s)}
                          onChange={(e) => setDrafts({ ...drafts, [s.key]: e.target.value })}
                        />
                      )}
                      <button className="save-btn" disabled={savingKey === s.key} onClick={() => save(s)}>
                        {savingKey === s.key ? "Saving…" : savedKey === s.key ? "Saved ✓" : "Save"}
                      </button>
                    </div>
                    {fieldError[s.key] && <p className="error-text" style={{ margin: 0 }}>{fieldError[s.key]}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!settings.length && !error && <p className="setting-desc">Loading settings…</p>}
      {error && <p className="error-text" style={{ marginTop: 16 }}>{error}</p>}
    </div>
  );
}
