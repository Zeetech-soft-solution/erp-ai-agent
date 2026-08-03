import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsService } from "../services/notificationsService";
import { NotificationItem } from "../services/types";
import { formatRelativeTime } from "../components/StatusBadge";

const POLL_MS = 15000;

/**
 * Real feed, not sample data: polls GET /api/agent/alerts (an actual
 * ERPNext webhook, see backend core/alertStore.ts) every 15s. That
 * endpoint drains its queue on each call, so results are appended to what
 * we already have rather than replacing it - a poll returning nothing just
 * means nothing new arrived this tick, not that the list is empty.
 *
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
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const fresh = await notificationsService.poll();
        if (cancelled || !fresh.length) return;
        const unseen = fresh.filter((n) => !seenIds.current.has(n.id));
        unseen.forEach((n) => seenIds.current.add(n.id));
        if (unseen.length) setItems((prev) => [...unseen, ...prev]);
      } catch {
        // Transient network/auth hiccup - just try again next tick.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  function runAction(n: NotificationItem) {
    if (!n.action) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    navigate("/chat", { state: { autoPrompt: n.action.prompt } });
  }

  return (
    <div className="tab-page">
      <div className="tab-page-header">
        <h2>Notifications</h2>
        <p>Live feed, checked every 15 seconds - with a one-click next step into chat.</p>
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
