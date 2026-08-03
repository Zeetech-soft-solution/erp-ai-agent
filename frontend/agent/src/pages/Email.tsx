import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { emailService } from "../services/emailService";
import { EmailItem } from "../services/types";
import { StatusBadge, formatRelativeTime } from "../components/StatusBadge";

export function Email() {
  const [items, setItems] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    emailService.list().then((r) => { setItems(r); setLoading(false); });
  }, []);

  async function quickReply(id: string) {
    setSendingId(id);
    const updated = await emailService.quickReply(id);
    setItems((prev) => prev.map((e) => (e.id === id ? updated : e)));
    setSendingId(null);
  }

  function runAction(e: EmailItem) {
    if (!e.action) return;
    emailService.markActionTaken(e.id).then((updated) => {
      setItems((prev) => prev.map((x) => (x.id === e.id ? updated : x)));
    });
    navigate("/chat", { state: { autoPrompt: e.action.prompt } });
  }

  return (
    <div className="tab-page">
      <div className="tab-page-header">
        <h2>Email</h2>
        <p>Simple threads get a one-click acknowledgement; anything real routes into chat.</p>
      </div>
      {loading && <div className="empty-state">Loading…</div>}
      <div className="card-list">
        {items.map((e) => (
          <div className="card" key={e.id}>
            <div className="card-main">
              <div className="card-top-row">
                <span className="card-from">{e.from}</span>
                <span className="card-time">{formatRelativeTime(e.receivedAt)}</span>
              </div>
              <div className="card-title">{e.subject}</div>
              <div className="card-body">{e.preview}</div>
              <div className="card-bottom-row">
                <StatusBadge status={e.status} />
              </div>
            </div>
            <div className="card-actions">
              {e.quickReplyable && e.status === "none" && (
                <button type="button" className="action-btn secondary" disabled={sendingId === e.id} onClick={() => quickReply(e.id)}>
                  {sendingId === e.id ? "Sending…" : "Reply"}
                </button>
              )}
              {e.action && e.status !== "action_taken" && (
                <button type="button" className="action-btn" onClick={() => runAction(e)}>
                  {e.action.label}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
