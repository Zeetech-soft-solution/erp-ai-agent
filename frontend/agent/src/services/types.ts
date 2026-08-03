/**
 * Canonical shapes for the four sample-data tabs (Notifications, Email,
 * Support, Projects). These are UI-facing domain types, not tied to any
 * one backend - same discipline as the core's SystemConnector: the page
 * components only ever import from services/*, never from a sample-data
 * file directly, so swapping mockService for a real HTTP-backed one later
 * is a one-file change (see each service's header comment).
 */

export type ActionStatus = "none" | "replied" | "action_taken" | "resolved" | "done";

export interface WorkflowAction {
  label: string;
  /** Plain-language prompt sent into the same chat session when clicked -
   *  the reasoning engine handles it exactly like the user typed it. */
  prompt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  module: string;
  action?: WorkflowAction;
  read?: boolean;
}

export interface EmailItem {
  id: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: string;
  status: ActionStatus;
  /** true = a quick auto-reply is a sensible response; false = it needs a
   *  real workflow action instead (routed to chat via `action`). */
  quickReplyable: boolean;
  action?: WorkflowAction;
}

export interface SupportTicket {
  id: string;
  subject: string;
  requester: string;
  priority: "Low" | "Medium" | "High";
  status: ActionStatus;
  createdAt: string;
  action?: WorkflowAction;
}

export interface IssueComment {
  author: string;
  text: string;
  at: string;
  auto?: boolean;
}

export interface ProjectIssue {
  id: string;
  key: string;
  title: string;
  status: "Todo" | "In Progress" | "Done";
  assignee: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  comments: IssueComment[];
  action?: WorkflowAction;
}
