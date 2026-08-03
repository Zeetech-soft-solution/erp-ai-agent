import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Alert, ChatTurn } from "../api/types";
import { ResponseView } from "../components/ResponseView";
import { DetailPanel } from "../components/DetailPanel";
import { Composer } from "../components/Composer";

/**
 * This is the core screen: login lands here. One component tree serves
 * both mobile and desktop — the detail panel simply doesn't render
 * (display: none) below 900px via CSS, rather than being a separate
 * code path. That's the "same site initializes mobile and desktop"
 * requirement from the brief.
 */
function alertToTurn(alert: Alert): ChatTurn {
  return {
    id: alert.id,
    prompt: "",
    isAlert: true,
    response: { type: "text", message: alert.message, meta: { modules_used: [], tools_used: [], role_context: [] } },
  };
}

export function Chat() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Polls for proactive alerts (an ERPNext webhook today — see
  // routes/webhooks.routes.ts) since chat is otherwise pure request/
  // response with nothing pushing into an already-open tab. 15s is a
  // deliberate compromise: no persistent connection or deployment
  // change needed, at the cost of not being instant.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { alerts } = await api.alerts();
        if (alerts?.length) {
          setTurns((prev) => [...prev, ...alerts.map(alertToTurn)]);
        }
      } catch {
        // Transient network/auth hiccup — just try again next tick.
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Notifications/Email/Support/Projects action buttons hand a plain-
  // language prompt to this SAME chat session via router state, rather
  // than opening a separate thread - clearing the state (replace) right
  // after consuming it stops a page refresh or back-navigation from
  // re-sending the same prompt.
  useEffect(() => {
    const autoPrompt = (location.state as { autoPrompt?: string } | null)?.autoPrompt;
    if (autoPrompt) {
      send(autoPrompt);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  async function send(prompt: string) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setTurns((prev) => [...prev, { id, prompt, pending: true }]);
    setSending(true);
    try {
      const response = await api.prompt(prompt);
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, response, pending: false } : t)));
    } catch (err: any) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, pending: false, response: { type: "text", message: `Error: ${err.message}`, meta: { modules_used: [], tools_used: [], role_context: [] } } }
            : t
        )
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="agent-body">
      <div className="chat-column">
        <div className="message-list">
          {!turns.length && (
            <div className="bubble-agent">
              Ask me about leads, opportunities, orders, or anything else your role has access to.
            </div>
          )}
          {turns.map((t) =>
            t.isAlert ? (
              <div key={t.id} className="turn">
                <div className="bubble-alert">{t.response?.message}</div>
              </div>
            ) : (
              <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="turn">
                  <div className="bubble-user">{t.prompt}</div>
                </div>
                <div className="turn">
                  {t.pending ? (
                    <div className="bubble-agent pending">Thinking…</div>
                  ) : (
                    t.response && <ResponseView response={t.response} onNextStep={send} />
                  )}
                </div>
              </div>
            )
          )}
        </div>
        <Composer onSend={send} disabled={sending} />
      </div>

      <DetailPanel />
    </div>
  );
}
