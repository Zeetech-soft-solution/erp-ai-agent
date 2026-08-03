import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { emailService } from "../services/emailService";
import { EmailItem, SentEmailItem } from "../services/types";
import { StatusBadge, formatRelativeTime } from "../components/StatusBadge";

const POLL_MS = 15000;

/**
 * Every action here routes into chat, same as Notifications/Support/
 * Projects - there's no "instant fake reply" path. Reply asks the agent to
 * draft one (the real email.draft tool, see the capabilities panel);
 * Action asks it to investigate. Either way, the actual solution and the
 * confirm-before-it's-real step happen through the normal reasoning loop
 * (the LLM's own next-step buttons, see ResponseView/tableRenderer), not
 * a button here pretending the work is already done.
 *
 * Inbox/Sent split: Inbox is still the sample list (no real mailbox
 * connected yet, see backend providers/mail/stubMailboxConnector.ts).
 * Sent is real - it's whatever the LLM has actually called email.send
 * for (polled from GET /api/agent/sent-emails), so confirming a reply in
 * chat is what makes it show up here, not a local guess made the moment
 * the Reply button is clicked.
 */
export function Email() {
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [items, setItems] = useState<EmailItem[]>([]);
  const [sent, setSent] = useState<SentEmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const pollStarted = useRef(false);

  useEffect(() => {
    emailService.list().then((r) => { setItems(r); setLoading(false); });
  }, []);

  useEffect(() => {
    if (pollStarted.current) return;
    pollStarted.current = true;
    let cancelled = false;
    function loadSent() {
      emailService.sent().then((r) => { if (!cancelled) setSent(r); }).catch(() => {});
    }
    loadSent();
    const interval = setInterval(loadSent, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  function goToChat(e: EmailItem, prompt: string, nextStatus: EmailItem["status"]) {
    setItems((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: nextStatus } : x)));
    navigate("/chat", { state: { autoPrompt: prompt, silent: true } });
  }

  function reply(e: EmailItem) {
    // Sent silently - the LLM needs the real sender address to call
    // email.send with the right "to", but nothing here shows up in the
    // visible chat transcript (see Chat.tsx's `silent` handling).
    const prompt = `I got this email:\nFrom: ${e.from}\nSubject: ${e.subject}\n"${e.preview}"\n\nDraft a reply, and once I confirm it, send it to ${e.from}.`;
    goToChat(e, prompt, "replied");
  }

  function runAction(e: EmailItem) {
    if (!e.action) return;
    goToChat(e, e.action.prompt, "action_taken");
  }

  return (
    <div className="tab-page">
      <div className="tab-page-header">
        <h2>Email</h2>
        <p>Every action routes into chat - the agent proposes a reply or next step, you confirm it there.</p>
      </div>

      <div className="subtab-nav">
        <button type="button" className={`subtab-btn${tab === "inbox" ? " active" : ""}`} onClick={() => setTab("inbox")}>
          Inbox<span className="subtab-count">{items.length}</span>
        </button>
        <button type="button" className={`subtab-btn${tab === "sent" ? " active" : ""}`} onClick={() => setTab("sent")}>
          Sent<span className="subtab-count">{sent.length}</span>
        </button>
      </div>

      {tab === "inbox" && (
        <>
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
                    <button type="button" className="action-btn secondary" onClick={() => reply(e)}>
                      Reply
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
        </>
      )}

      {tab === "sent" && (
        <div className="card-list">
          {!sent.length && <div className="empty-state">Nothing sent yet - confirm a reply in chat and it'll show up here.</div>}
          {sent.map((s) => (
            <div className="card" key={s.id}>
              <div className="card-main">
                <div className="card-top-row">
                  <span className="card-to">To: {s.to}</span>
                  <span className="card-time">{formatRelativeTime(s.sentAt)}</span>
                </div>
                <div className="card-title">{s.subject}</div>
                <div className="card-body">{s.body}</div>
                <div className="card-bottom-row">
                  <span className="card-sent-tag">Sent via agent</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
