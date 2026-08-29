/** Mirrors backend core/types.ts AgentResponse — kept in sync manually
 *  for now; worth generating from a shared package once the API surface
 *  stabilizes (e.g. a small @erp-agent/contracts workspace package). */
export type AgentResponseType = "text" | "report" | "document" | "action_result";

export interface AgentResponse {
  type: AgentResponseType;
  message: string;
  data?: any;
  html?: string;
  document?: { name: string; url?: string; content?: string };
  interaction_id?: string;
  meta: {
    modules_used: string[];
    tools_used: string[];
    role_context: string[];
  };
}

export interface ChatTurn {
  id: string;
  prompt: string;
  response?: AgentResponse;
  pending?: boolean;
  /** True for a workflow-tab handoff (Notifications/Email/Support/Projects) -
   *  the bubble shows a generic "Sending details…" placeholder instead of
   *  the actual prompt text, which may carry details (like a raw email
   *  address) the LLM needs but the user doesn't need echoed back. */
  silent?: boolean;
}

/** Mirrors backend core/alertStore.ts StoredNotification — a proactive
 *  notification (an ERPNext webhook today), persisted in Postgres and
 *  read via GET /api/agent/notifications (history, or delta with `since`),
 *  never destructively consumed. Surfaced in the Notifications tab. */
export interface StoredNotification {
  id: string;
  entityKey: string;
  recordId: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}
