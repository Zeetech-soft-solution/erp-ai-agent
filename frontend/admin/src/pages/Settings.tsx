import { useEffect, useState } from "react";
import { api } from "../api/client";
import { StatusStrip } from "../components/StatusStrip";

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
const CATEGORY_ORDER = ["general", "email", "support", "projplan", "policy"];
const CATEGORY_LABELS: Record<string, { title: string; subtitle: string }> = {
  general: { title: "General", subtitle: "Core operational knobs for the agent app." },
  email: { title: "Email (SMTP)", subtitle: "Outgoing mail server used for notifications." },
  support: { title: "Support portal", subtitle: "Where and how new support tickets are routed." },
  projplan: { title: "Project planning", subtitle: "Defaults for the Projects module." },
  policy: { title: "Policy documents", subtitle: "Defaults for the Policy Documents upload form." },
};

/**
 * These fields save to the database (a real `settings` row, with an
 * audit-log entry) so the structure is ready, but nothing in the agent
 * backend reads the email, support, project-plan, or policy groups yet
 * (nor the two new general fields, jwt_expires_in and
 * context_session_turns). This page is deliberately write-path-only
 * while that wiring is still pending; see the banner below.
 */
const SAVE_DISABLED_MESSAGE =
  "Not authorized to save yet — this settings group is still being built and isn't wired to the agent, so saving is disabled for now.";

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
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  function load() {
    api.getSettings().then((r) => setSettings(r.settings)).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  function draftFor(s: Setting) {
    return s.key in drafts ? drafts[s.key] : s.value;
  }

  // Validates, then stops here — the actual save call is intentionally
  // never made while this feature is pending authorization (see
  // SAVE_DISABLED_MESSAGE above). Nothing is sent to the server.
  function save(s: Setting) {
    setError("");
    const raw = draftFor(s);
    const problem = validate(s, raw);
    if (problem) {
      setFieldError({ ...fieldError, [s.key]: problem });
      return;
    }
    setFieldError({ ...fieldError, [s.key]: "" });
    setSavingKey(s.key);
    setTimeout(() => {
      setSavingKey(null);
      setError(SAVE_DISABLED_MESSAGE);
    }, 400);
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({ cat, rows: settings.filter((s) => s.category === cat) })).filter(
    (g) => g.rows.length
  );
  const otherCats = [...new Set(settings.map((s) => s.category))].filter((c) => !CATEGORY_ORDER.includes(c));
  for (const cat of otherCats) grouped.push({ cat, rows: settings.filter((s) => s.category === cat) });

  return (
    <div className="main">
      <h1 className="page-title">Global settings</h1>

      <StatusStrip />

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
                        {savingKey === s.key ? "Saving…" : "Save"}
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
