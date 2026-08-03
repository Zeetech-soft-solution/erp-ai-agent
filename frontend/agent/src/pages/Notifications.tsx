import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsService } from "../services/notificationsService";
import { NotificationItem } from "../services/types";
import { formatRelativeTime } from "../components/StatusBadge";

/**
 * Each notification's action button doesn't do anything itself - it sends
 * a plain-language prompt into the SAME chat session (via router state) and
 * switches back to it, so the actual work always happens through the one
 * reasoning engine + tool-call path, with the same role gating and audit
 * trail as if the user had typed the prompt themselves.
 */
export function Notifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    notificationsService.list().then((r) => { setItems(r); setLoading(false); });
  }, []);

  function runAction(n: NotificationItem) {
    if (!n.action) return;
    notificationsService.markRead(n.id);
    navigate("/chat", { state: { autoPrompt: n.action.prompt } });
  }

  return (
    <div className="tab-page">
      <div className="tab-page-header">
        <h2>Notifications</h2>
        <p>Things worth a look, with a one-click next step into chat.</p>
      </div>
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && !items.length && <div className="empty-state">You're all caught up.</div>}
      <div className="card-list">
        {items.map((n) => (
          <div className={`card notification-card${n.read ? " is-read" : ""}`} key={n.id}>
            <div className="card-main">
              <div className="card-top-row">
                <span className="module-tag">{n.module}</span>
                <span className="card-time">{formatRelativeTime(n.createdAt)}</span>
              </div>
              <div className="card-title">{n.title}</div>
              <div className="card-body">{n.message}</div>
            </div>
            {n.action && (
              <button type="button" className="action-btn" onClick={() => runAction(n)}>
                {n.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
