import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsService } from "../services/notificationsService";
import { NotificationItem } from "../services/types";
import { formatRelativeTime } from "../components/StatusBadge";

const POLL_MS = 15000;

function dedupeById(items: NotificationItem[]): NotificationItem[] {
  const seen = new Set<string>();
  return items.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}

/**
 * Real feed, not sample data: loads recent history on mount (so the tab
 * isn't empty just because you weren't watching when something arrived),
 * then polls every 15s for only what's new since the last item seen. The
 * backend (GET /api/agent/notifications, Postgres-backed - see
 * core/alertStore.ts) never consumes what it returns, so this cursor is
 * purely a client-side "don't re-fetch old rows" optimization, not the
 * only copy of the data the way the old drain-once queue was.
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
  const cursor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const history = await notificationsService.history();
        if (cancelled) return;
        // Dedupe by id, not just replace - React 18 StrictMode runs this
        // effect twice on mount in some setups, and this must stay correct
        // either way rather than relying on it only running once.
        setItems((prev) => dedupeById([...history, ...prev]));
        if (history.length) cursor.current = history[0].createdAt; // newest first from the API
      } catch {
        // Transient network/auth hiccup - the poll loop will retry.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function pollDelta() {
      if (!cursor.current) return;
      try {
        const fresh = await notificationsService.since(cursor.current);
        if (cancelled || !fresh.length) return;
        cursor.current = fresh[fresh.length - 1].createdAt; // since() returns oldest-first
        setItems((prev) => dedupeById([...fresh].reverse().concat(prev)));
      } catch {
        // Transient network/auth hiccup - just try again next tick.
      }
    }

    loadHistory();
    const interval = setInterval(pollDelta, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  function runAction(n: NotificationItem) {
    if (!n.action) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    notificationsService.markRead(n.id);
    navigate("/chat", { state: { autoPrompt: n.action.prompt, silent: true } });
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
