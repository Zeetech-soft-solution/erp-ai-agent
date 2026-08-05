import { NavLink } from "react-router-dom";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">ERP <span>Agent</span> Admin</div>
      <nav className="sidebar-nav">
        <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
          Global settings
        </NavLink>
        <NavLink to="/users" className={({ isActive }) => (isActive ? "active" : "")}>
          User credentials
        </NavLink>
        <NavLink to="/policy-documents" className={({ isActive }) => (isActive ? "active" : "")}>
          Policy documents
        </NavLink>
        <NavLink to="/email-settings" className={({ isActive }) => (isActive ? "active" : "")}>
          Email settings
        </NavLink>
        <NavLink to="/support-settings" className={({ isActive }) => (isActive ? "active" : "")}>
          Support settings
        </NavLink>
        <NavLink to="/project-settings" className={({ isActive }) => (isActive ? "active" : "")}>
          Project settings
        </NavLink>
        {/* Add more admin sections here as the console grows:
            role policy editor, module toggles, audit log viewer, etc. */}
      </nav>
    </aside>
  );
}
