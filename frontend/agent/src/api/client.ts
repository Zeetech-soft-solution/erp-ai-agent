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
  workflowActions: (module: string) => request(`/api/agent/workflow-actions?module=${encodeURIComponent(module)}`),
  setToken: (token: string) => localStorage.setItem("erp_agent_token", token),
  clearToken: () => localStorage.removeItem("erp_agent_token"),
  isLoggedIn: () => !!getToken(),
};
