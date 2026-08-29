const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function getToken() {
  return localStorage.getItem("erp_agent_token");
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

/** Fetches an authenticated binary response (a PDF, e.g.) and triggers
 *  a browser download — a plain <a href> can't carry the Authorization
 *  header this needs, so this does the fetch itself and hands the
 *  browser a short-lived object URL instead. */
async function downloadFile(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  loginWithPassword: (email: string, password: string) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  loginWithApiKey: (email: string, apiKey: string, apiSecret: string) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, apiKey, apiSecret }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  prompt: (prompt: string) => request("/api/agent/prompt", { method: "POST", body: JSON.stringify({ prompt }) }),
  sendFeedback: (interactionId: string, feedback: 1 | -1 | null) =>
    request(`/api/agent/feedback/${interactionId}`, { method: "POST", body: JSON.stringify({ feedback }) }),
  capabilities: () => request("/api/agent/capabilities"),
  notifications: (since?: string) =>
    request(`/api/agent/notifications${since ? `?since=${encodeURIComponent(since)}` : ""}`),
  markNotificationRead: (id: string) => request(`/api/agent/notifications/${id}/read`, { method: "POST" }),
  sentEmails: () => request("/api/agent/sent-emails"),
  // Direct tool call, bypassing the chat/LLM loop entirely - used by the
  // Email tab's Compose form so a demo user can send a real test email
  // without having to type a natural-language prompt first.
  callTool: (name: string, args: Record<string, unknown>) =>
    request(`/api/tools/${name}`, { method: "POST", body: JSON.stringify(args) }),
  workflowActions: (module: string) => request(`/api/agent/workflow-actions?module=${encodeURIComponent(module)}`),
  downloadFile,
  setToken: (token: string) => localStorage.setItem("erp_agent_token", token),
  clearToken: () => localStorage.removeItem("erp_agent_token"),
  isLoggedIn: () => !!getToken(),
};
