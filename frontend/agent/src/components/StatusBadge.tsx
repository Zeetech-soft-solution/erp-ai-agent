import { ActionStatus } from "../services/types";

/** One consistent label/color set for "what happened to this item" across
 *  Email, Support, and Notifications - so the same word always means the
 *  same thing no matter which tab you're looking at. */
const LABELS: Record<ActionStatus, string> = {
  none: "Needs attention",
  replied: "Replied",
  action_taken: "Action taken",
  resolved: "Resolved",
  done: "Done",
};

export function StatusBadge({ status }: { status: ActionStatus }) {
  return <span className={`status-badge status-${status}`}>{LABELS[status]}</span>;
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
