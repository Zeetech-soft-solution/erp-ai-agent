import { api } from "../api/client";
import { StoredNotification } from "../api/types";
import { NotificationItem } from "./types";

/**
 * Real data, not sample - GET /api/agent/notifications is backed by an
 * actual ERPNext webhook, persisted in Postgres (see backend
 * core/alertStore.ts + db/migrations/006_notifications.sql). Nothing is
 * consumed by reading it: `history()` is a bounded recent-history query,
 * `since(cursor)` returns only what's arrived after that timestamp - the
 * page component polls with the previous call's newest timestamp as the
 * next cursor, so results only ever accumulate, matching what actually
 * happened server-side rather than a client-guessed "unseen" set.
 */
function toItem(n: StoredNotification): NotificationItem {
  const module = n.entityKey ? n.entityKey.charAt(0).toUpperCase() + n.entityKey.slice(1) : "Update";
  return {
    id: n.id,
    module,
    title: `${module} update`,
    message: n.message,
    createdAt: n.createdAt,
    read: !!n.readAt,
    action: n.recordId
      ? { label: "View details", prompt: `show me details for ${n.entityKey} ${n.recordId}` }
      : undefined,
  };
}

export const notificationsService = {
  history: async (): Promise<NotificationItem[]> => {
    const { notifications } = await api.notifications();
    return (notifications as StoredNotification[]).map(toItem);
  },
  since: async (cursor: string): Promise<NotificationItem[]> => {
    const { notifications } = await api.notifications(cursor);
    return (notifications as StoredNotification[]).map(toItem);
  },
  markRead: (id: string): Promise<void> => api.markNotificationRead(id).catch(() => {}),
};
