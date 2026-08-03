import { api } from "../api/client";
import { Alert } from "../api/types";
import { NotificationItem } from "./types";

/**
 * Real data, not sample - GET /api/agent/alerts is backed by an actual
 * ERPNext webhook (see backend core/alertStore.ts). That endpoint DRAINS
 * its queue on every call (delivery is destructive, not idempotent), so
 * there must be exactly one poller for it anywhere in the app - this is
 * that one place. It used to also be polled from Chat.tsx; that's been
 * removed, since two independent 15s polls against a drain() endpoint
 * would race and steal each other's alerts.
 */
function alertToNotification(a: Alert): NotificationItem {
  const module = a.entityKey ? a.entityKey.charAt(0).toUpperCase() + a.entityKey.slice(1) : "Update";
  return {
    id: a.id,
    module,
    title: `${module} update`,
    message: a.message,
    createdAt: a.createdAt,
    action: a.recordId
      ? { label: "View details", prompt: `show me details for ${a.entityKey} ${a.recordId}` }
      : undefined,
  };
}

export const notificationsService = {
  /** One drain of whatever's currently queued - call on an interval, never in parallel from two places. */
  poll: async (): Promise<NotificationItem[]> => {
    const { alerts } = await api.alerts();
    return (alerts || []).map(alertToNotification);
  },
  markRead: (_id: string): Promise<void> => Promise.resolve(),
};
