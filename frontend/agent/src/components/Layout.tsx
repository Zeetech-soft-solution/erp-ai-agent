import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../api/client";
import { notificationsService } from "../services/notificationsService";
import { DetailPanel } from "./DetailPanel";

const WORKFLOW_TABS = [
  { to: "/notifications", label: "Notifications" },
  { to: "/email", label: "Email" },
  { to: "/support", label: "Support" },
  { to: "/projects", label: "Projects" },
];

const UNREAD_POLL_MS = 15000;

// Zeetech's "Z" logomark (see zeetech-website/assets/icon-master.svg) -
// inlined so the header needs no extra network request and scales cleanly
// at any size.
function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 512 512" className="brand-mark" aria-hidden="true">
      <rect width="512" height="512" rx="108" fill="#0E1512" />
      <text x="256" y="344" fontFamily="'Space Grotesk', 'Arial', sans-serif" fontSize="248" fontWeight="700" letterSpacing="-4" fill="#4FBB9C" textAnchor="middle">
        Z
      </text>
    </svg>
  );
}

/** Shared chrome for every authenticated page - the chat session itself
 *  lives entirely inside <Chat/> and is unaffected by switching tabs;
 *  navigating away and back doesn't lose it (React Router keeps the route
 *  tree mounted only while active, but Chat's own state is re-fetched
 *  fresh each time by design - it's a live session, not a draft).
 *
 * The brand and "Chat" used to be two separate header elements; they're
 * now one clickable heading (Zyte Process Agent, with the Zeetech mark) -
 * Chat IS the home surface, not a tab alongside the brand. The workflow
 * tabs (Notifications/Email/Support/Projects) live in a left rail against
 * the content area's border instead of the top nav - they're feeds that
 * hand work back to Chat, not peers of it. Sign out stays top-right. */
export function Layout() {
  const [unreadCount, setUnreadCount] = useState(0);

  // Polled here, not just inside <Notifications/>, so the rail badge shows
  // an arrived alert even while looking at Chat/Email/Support/Projects -
  // the same 15s cadence as the Notifications tab's own poll. The count
  // only ever falls when the user actually reads/acts on something (see
  // notificationsService.markRead, called from the "View details" next
  // step) - never just from time passing or switching tabs.
  useEffect(() => {
    let cancelled = false;
    function loadUnread() {
      notificationsService.history().then((items) => {
        if (!cancelled) setUnreadCount(items.filter((n) => !n.read).length);
      }).catch(() => {});
    }
    loadUnread();
    const interval = setInterval(loadUnread, UNREAD_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="agent-shell">
      <header className="agent-header">
        <NavLink to="/chat" className="brand-link">
          <BrandMark />
          <span className="brand">Zyte <span>Process Agent</span></span>
        </NavLink>
        <button
          onClick={async () => { await api.logout().catch(() => {}); api.clearToken(); window.location.href = `${import.meta.env.BASE_URL}login`; }}
          className="sign-out-btn"
        >
          Sign out
        </button>
      </header>
      <div className="agent-shell-body">
        <nav className="side-rail">
          <NavLink to="/chat" className={({ isActive }) => `side-rail-link side-rail-link-primary${isActive ? " active" : ""}`}>
            Zyte Chat
          </NavLink>
          <div className="side-rail-divider" />
          {WORKFLOW_TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `side-rail-link${isActive ? " active" : ""}`}>
              {t.label}
              {t.to === "/notifications" && unreadCount > 0 && <span className="side-rail-badge">{unreadCount}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="agent-shell-main">
          <Outlet />
        </div>
        <DetailPanel />
      </div>
    </div>
  );
}
