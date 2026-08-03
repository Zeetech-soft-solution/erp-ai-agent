import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supportService } from "../services/supportService";
import { SupportTicket } from "../services/types";
import { StatusBadge, formatRelativeTime } from "../components/StatusBadge";

/**
 * Same rule as Email: no button here pretends the work is already done.
 * Both "investigate" and "resolve" route into chat - the agent looks at
 * the real record and proposes what to do, the confirm step happens there
 * (the LLM's own next-step buttons), not as an instant local status flip.
 */
export function Support() {
  const [items, setItems] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supportService.list().then((r) => { setItems(r); setLoading(false); });
  }, []);

  function goToChat(t: SupportTicket, prompt: string, nextStatus: SupportTicket["status"]) {
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: nextStatus } : x)));
    navigate("/chat", { state: { autoPrompt: prompt, silent: true } });
  }

  function investigate(t: SupportTicket) {
    if (!t.action) return;
    goToChat(t, t.action.prompt, "action_taken");
  }

  function resolve(t: SupportTicket) {
    const prompt = `I got this support ticket:\nFrom: ${t.requester}\nPriority: ${t.priority}\nSubject: ${t.subject}\n\nWhat should I do about this?`;
    goToChat(t, prompt, "resolved");
  }

  return (
    <div className="tab-page">
      <div className="tab-page-header">
        <h2>Support</h2>
        <p>Every action routes into chat - the agent proposes a next step or resolution, you confirm it there.</p>
      </div>
      {loading && <div className="empty-state">Loading…</div>}
      <div className="card-list">
        {items.map((t) => (
          <div className="card" key={t.id}>
            <div className="card-main">
              <div className="card-top-row">
                <span className={`priority-tag priority-${t.priority.toLowerCase()}`}>{t.priority}</span>
                <span className="card-time">{formatRelativeTime(t.createdAt)}</span>
              </div>
              <div className="card-title">{t.subject}</div>
              <div className="card-body">From {t.requester}</div>
              <div className="card-bottom-row">
                <StatusBadge status={t.status} />
              </div>
            </div>
            <div className="card-actions">
              {t.status !== "resolved" && (
                <>
                  {t.action && (
                    <button type="button" className="action-btn secondary" onClick={() => investigate(t)}>
                      {t.action.label}
                    </button>
                  )}
                  <button type="button" className="action-btn" onClick={() => resolve(t)}>
                    Resolve
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
