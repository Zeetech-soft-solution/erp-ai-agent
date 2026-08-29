import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { emailService } from "../services/emailService";
import { api } from "../api/client";
import { EmailItem, SentEmailItem } from "../services/types";
import { StatusBadge, formatRelativeTime } from "../components/StatusBadge";

interface ContactOption {
  id: string;
  display_name: string;
  email: string | null;
  company_name: string | null;
}

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
 * connected yet). Sent is real - it's whatever the LLM has actually called email.send
 * for (polled from GET /api/agent/sent-emails), so confirming a reply in
 * chat is what makes it show up here, not a local guess made the moment
 * the Reply button is clicked.
 */
export function Email() {
  const [tab, setTab] = useState<"inbox" | "sent" | "compose">("inbox");
  const [items, setItems] = useState<EmailItem[]>([]);
  const [sent, setSent] = useState<SentEmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const pollStarted = useRef(false);
  const loadSentRef = useRef<() => void>(() => {});

  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [composeSuccess, setComposeSuccess] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");

  useEffect(() => {
    emailService.list().then((r) => { setItems(r); setLoading(false); });
  }, []);

  useEffect(() => {
    // Contact, not customer.list: Customer.email_id/mobile_no are Frappe
    // "Read Only" fetched fields that come back blank on a direct API
    // read in this dataset (they're populated from a linked primary
    // Contact, not stored on Customer itself) - confirmed live, Customer
    // rows all had email: "". Contact has real, populated addresses.
    // Best-effort either way - not every role has contact.list, and
    // that's fine: the To field stays a plain free-text input regardless
    // (send to anyone).
    api.callTool("contact.list", { limit: 100 })
      .then(({ data }) => setContacts((data || []).filter((c: ContactOption) => c.email)))
      .catch(() => {});
  }, []);

  function pickContact(id: string) {
    setSelectedContactId(id);
    const c = contacts.find((x) => x.id === id);
    if (c?.email) setComposeTo(c.email);
  }

  useEffect(() => {
    if (pollStarted.current) return;
    pollStarted.current = true;
    let cancelled = false;
    function loadSent() {
      emailService.sent().then((r) => { if (!cancelled) setSent(r); }).catch(() => {});
    }
    loadSentRef.current = loadSent;
    loadSent();
    const interval = setInterval(loadSent, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function sendTestEmail(e: React.FormEvent) {
    e.preventDefault();
    setComposeError("");
    setComposeSuccess(false);
    setComposeSending(true);
    try {
      await emailService.send({ to: composeTo, subject: composeSubject, body: composeBody });
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setComposeSuccess(true);
      loadSentRef.current(); // pull the Sent view forward immediately, don't wait for the 15s poll
      setTab("sent");
    } catch (err: any) {
      setComposeError(err.message || "Send failed");
    } finally {
      setComposeSending(false);
    }
  }

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
        <button type="button" className={`subtab-btn${tab === "compose" ? " active" : ""}`} onClick={() => setTab("compose")}>
          Compose
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

      {tab === "compose" && (
        <form className="compose-form" onSubmit={sendTestEmail}>
          <p className="compose-hint">
            Send a test email — this calls the same tool the agent uses, so it's recorded and shows up in Sent
            immediately.
          </p>

          {contacts.length > 0 && (
            <select value={selectedContactId} onChange={(e) => pickContact(e.target.value)}>
              <option value="">Pick a contact (or type any address below)…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}{c.company_name ? ` (${c.company_name})` : ""} — {c.email}
                </option>
              ))}
            </select>
          )}

          <input
            type="email"
            placeholder="To (any email address)"
            value={composeTo}
            onChange={(e) => setComposeTo(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Subject"
            value={composeSubject}
            onChange={(e) => setComposeSubject(e.target.value)}
            required
          />
          <textarea
            placeholder="Body"
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
            required
          />

          <button type="submit" className="action-btn" disabled={composeSending}>
            {composeSending ? "Sending…" : "Send test email"}
          </button>
          {composeError && <p className="error-text">{composeError}</p>}
          {composeSuccess && <p className="success-text">Sent — check the Sent tab.</p>}
        </form>
      )}
    </div>
  );
}
