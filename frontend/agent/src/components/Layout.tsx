import { NavLink, Outlet } from "react-router-dom";
import { api } from "../api/client";

const WORKFLOW_TABS = [
  { to: "/notifications", label: "Notifications" },
  { to: "/email", label: "Email" },
  { to: "/support", label: "Support" },
  { to: "/projects", label: "Projects" },
];

/** Shared chrome for every authenticated page - the chat session itself
 *  lives entirely inside <Chat/> and is unaffected by switching tabs;
 *  navigating away and back doesn't lose it (React Router keeps the route
 *  tree mounted only while active, but Chat's own state is re-fetched
 *  fresh each time by design - it's a live session, not a draft).
 *
 * Chat sits on its own, right next to the brand, as the default/primary
 * surface - the workflow tabs (Notifications/Email/Support/Projects) are
 * grouped separately and pushed to the right, so the header reads as
 * "Chat is home base, these are the feeds that hand work back to it." */
export function Layout() {
  return (
    <div className="agent-shell">
      <header className="agent-header">
        <div className="brand">ERP <span>Agent</span></div>
        <nav className="tab-nav-primary">
          <NavLink to="/chat" className={({ isActive }) => `tab-nav-link${isActive ? " active" : ""}`}>
            Chat
          </NavLink>
        </nav>
        <nav className="tab-nav-secondary">
          {WORKFLOW_TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `tab-nav-link${isActive ? " active" : ""}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={async () => { await api.logout().catch(() => {}); api.clearToken(); window.location.href = `${import.meta.env.BASE_URL}login`; }}
          className="sign-out-btn"
        >
          Sign out
        </button>
      </header>
      <Outlet />
    </div>
  );
}
