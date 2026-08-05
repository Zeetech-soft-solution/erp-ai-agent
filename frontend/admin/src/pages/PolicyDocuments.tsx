import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

interface PolicyDocument {
  id: string;
  title: string;
  module: string | null;
  filename: string;
  raw_text: string;
  uploaded_by: string;
  version: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Mirrors the canonical ERP module keys used across backend/src/config —
// admin-facing only (a label prefix on the embedded chunks, see
// core/policyDocumentStore.ts), not a hard-coded contract the backend
// validates against.
const MODULE_KEYS = ["crm", "selling", "buying", "stock", "accounting", "hr", "manufacturing", "projects", "assets", "quality"];

/**
 * Admin uploads a Word doc of business policy / workflow rules; it's
 * extracted, chunked, and embedded into the same vector context tier
 * prompts already draw on (see core/policyDocumentStore.ts) — so the
 * agent can cite it like any other retrieved context. Editing the text
 * here re-embeds automatically; no re-upload needed for a wording fix.
 */
export function PolicyDocuments() {
  const [docs, setDocs] = useState<PolicyDocument[]>([]);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [moduleKey, setModuleKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    api.getPolicyDocuments().then((r) => setDocs(r.documents)).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await api.uploadPolicyDocument(file, title, moduleKey);
      setTitle(""); setModuleKey(""); setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function startEdit(doc: PolicyDocument) {
    setEditingId(doc.id);
    setEditDraft(doc.raw_text);
  }

  async function saveEdit(doc: PolicyDocument) {
    setSaving(true);
    setError("");
    try {
      await api.updatePolicyDocument(doc.id, { text: editDraft });
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(doc: PolicyDocument) {
    try {
      await api.setPolicyDocumentActive(doc.id, !doc.active);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(doc: PolicyDocument) {
    if (!confirm(`Delete "${doc.title}"? This removes it and every chunk embedded from it — this can't be undone.`)) return;
    try {
      await api.deletePolicyDocument(doc.id);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="main">
      <h1 className="page-title">Policy documents</h1>
      <p className="page-subtitle">
        Upload a Word document of business policy or workflow rules — it's extracted, chunked, and embedded
        into the agent's context so it can reference it when reasoning. Edit the text below at any time; it
        re-embeds automatically, no re-upload needed.
      </p>

      <a
        className="save-btn"
        style={{ display: "inline-block", textDecoration: "none", marginBottom: 16 }}
        href={`${import.meta.env.BASE_URL}policy-document-template.docx`}
        download
      >
        Download template (.docx)
      </a>

      <form className="card" onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="setting-input" style={{ width: "100%" }} placeholder="Title (e.g. Lead Qualification Policy)" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <select className="setting-input" style={{ width: "100%" }} value={moduleKey} onChange={(e) => setModuleKey(e.target.value)}>
          <option value="">All modules</option>
          {MODULE_KEYS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input ref={fileInputRef} type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        <button className="save-btn" type="submit" disabled={uploading || !file} style={{ alignSelf: "flex-start" }}>
          {uploading ? "Uploading & indexing…" : "Upload document"}
        </button>
      </form>

      {docs.length ? (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Module</th>
                <th>Version</th>
                <th>Uploaded by</th>
                <th>Updated</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <>
                  <tr key={doc.id}>
                    <td>{doc.title}</td>
                    <td>{doc.module || "all modules"}</td>
                    <td>v{doc.version}</td>
                    <td>{doc.uploaded_by}</td>
                    <td>{new Date(doc.updated_at).toLocaleString()}</td>
                    <td>{doc.active ? "Active" : <span style={{ color: "var(--ink-muted)" }}>Inactive</span>}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="save-btn" style={{ background: "transparent", color: "var(--ink)" }} onClick={() => (editingId === doc.id ? setEditingId(null) : startEdit(doc))}>
                          {editingId === doc.id ? "Cancel" : "Edit"}
                        </button>
                        <button className="save-btn" style={{ background: "transparent", color: "var(--ink)" }} onClick={() => toggleActive(doc)}>
                          {doc.active ? "Deactivate" : "Reactivate"}
                        </button>
                        <button className="save-btn" style={{ background: "transparent", color: "#A32D2D", borderColor: "#A32D2D" }} onClick={() => handleDelete(doc)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingId === doc.id && (
                    <tr key={`${doc.id}-edit`}>
                      <td colSpan={7}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
                          <textarea
                            className="setting-input"
                            style={{ width: "100%", minHeight: 220, fontFamily: "var(--font-body)" }}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                          />
                          <button className="save-btn" disabled={saving} style={{ alignSelf: "flex-start" }} onClick={() => saveEdit(doc)}>
                            {saving ? "Saving & re-indexing…" : "Save & re-index"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p className="setting-desc">No policy documents uploaded yet.</p>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
