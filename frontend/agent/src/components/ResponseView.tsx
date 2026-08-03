import { useRef, useState } from "react";
import { AgentResponse } from "../api/types";
import { api } from "../api/client";

/**
 * Renders the AgentResponse contract. "report" gets the server-rendered,
 * pre-sanitized HTML dropped in directly (the LLM never produced this
 * markup itself — see backend/core/rendererRegistry.ts). Next-step
 * buttons inside that HTML are wired via event delegation so clicking
 * one sends a new prompt, same as typing it.
 */
/** "crm.list_customers" -> "list customers" - a plain-language re-ask the
 * reasoning engine handles the same as if the user had typed it. */
function humanizeToolName(tool: string): string {
  const action = tool.includes(".") ? tool.slice(tool.lastIndexOf(".") + 1) : tool;
  return action.replace(/_/g, " ");
}

export function ResponseView({ response, onNextStep }: { response: AgentResponse; onNextStep: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  function handleClick(e: React.MouseEvent) {
    const target = (e.target as HTMLElement).closest(".erp-agent-next-step") as HTMLElement | null;
    if (target?.dataset.action) onNextStep(target.dataset.action);
  }

  return (
    <div className="bubble-agent">
      <div>{response.message}</div>

      {response.type === "report" && response.html && (
        <div className="agent-report-html" ref={ref} onClick={handleClick} dangerouslySetInnerHTML={{ __html: response.html }} />
      )}

      {response.type === "document" && response.document && (
        <div className="document-card">
          <span>{response.document.name}</span>
          {response.document.url && <a href={response.document.url}>Download</a>}
        </div>
      )}

      <div className="meta-row">
        {response.meta.tools_used.map((t) => (
          <button
            type="button"
            className="meta-chip"
            key={t}
            title={`Run this again: ${humanizeToolName(t)}`}
            onClick={() => onNextStep(humanizeToolName(t))}
          >
            {t}
          </button>
        ))}
        {response.interaction_id && <FeedbackControl interactionId={response.interaction_id} />}
      </div>
    </div>
  );
}

/**
 * Phase 1 of docs/TRAINING_PLAN.md: turns raw interaction_log rows into
 * labeled +1/-1 examples. Optimistic UI — re-clicking the active choice
 * clears it back to null (a mis-click shouldn't require a page reload
 * to undo). Silently reverts on network failure since this is low-stakes
 * feedback, not a form submission worth blocking the chat over.
 */
function FeedbackControl({ interactionId }: { interactionId: string }) {
  const [feedback, setFeedback] = useState<1 | -1 | null>(null);
  const [sending, setSending] = useState(false);

  async function rate(value: 1 | -1) {
    if (sending) return;
    const next = feedback === value ? null : value;
    const prev = feedback;
    setFeedback(next);
    setSending(true);
    try {
      await api.sendFeedback(interactionId, next);
    } catch {
      setFeedback(prev);
    } finally {
      setSending(false);
    }
  }

  return (
    <span className="feedback-control">
      <button
        type="button"
        className={`feedback-btn${feedback === 1 ? " active" : ""}`}
        aria-label="Good response"
        onClick={() => rate(1)}
      >
        👍
      </button>
      <button
        type="button"
        className={`feedback-btn${feedback === -1 ? " active" : ""}`}
        aria-label="Bad response"
        onClick={() => rate(-1)}
      >
        👎
      </button>
    </span>
  );
}
