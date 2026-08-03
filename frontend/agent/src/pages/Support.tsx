import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supportService } from "../services/supportService";
import { SupportTicket } from "../services/types";
import { StatusBadge, formatRelativeTime } from "../components/StatusBadge";

export function Support() {
  const [items, setItems] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supportService.list().then((r) => { setItems(r); setLoading(false); });
  }, []);

  function investigate(t: SupportTicket) {
    if (!t.action) return;
    navigate("/chat", { state: { autoPrompt: t.action.prompt } });
  }

  function resolve(id: string) {
    supportService.resolve(id).then((updated) => {
      setItems((prev) => prev.map((t) => (t.id === id ? updated : t)));
    });
  }

  return (
    <div className="tab-page">
      <div className="tab-page-header">
        <h2>Support</h2>
        <p>Open tickets, with a shortcut to check the record before you reply and a manual resolve.</p>
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
                  <button type="button" className="action-btn" onClick={() => resolve(t.id)}>
                    Mark resolved
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
