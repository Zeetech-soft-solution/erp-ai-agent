import { NotificationItem } from "./types";

/**
 * Sample data for now, per explicit instruction - no backend call yet.
 * Swap point for later: replace the body of `list()` with
 * `request("/api/notifications")` (see api/client.ts's `request` helper)
 * once a real notifications feed exists; nothing else in the app needs to
 * change since pages only ever call `notificationsService.list()`.
 */
let SAMPLE: NotificationItem[] = [
  {
    id: "n1",
    module: "CRM",
    title: "Lead qualified, ready to convert",
    message: "\"Kavita Singh\" (Rao Electricals) was qualified 2 days ago and hasn't moved since.",
    createdAt: "2026-08-01T09:12:00Z",
    action: { label: "Convert lead", prompt: "convert the lead for Kavita Singh at Rao Electricals" },
  },
  {
    id: "n2",
    module: "Sales",
    title: "Quotation about to expire",
    message: "Quotation QTN-2026-00042 for Sharma Industries expires in 2 days with no response yet.",
    createdAt: "2026-08-02T14:30:00Z",
    action: { label: "Follow up", prompt: "list my quotations that are expiring soon" },
  },
  {
    id: "n3",
    module: "Purchase",
    title: "Purchase order awaiting receipt",
    message: "PO-2026-00318 to Verma Systems was due 3 days ago and hasn't been received yet.",
    createdAt: "2026-08-02T08:00:00Z",
    action: { label: "Check status", prompt: "list my purchase orders that are overdue for receipt" },
  },
  {
    id: "n4",
    module: "HR",
    title: "Leave request pending your approval",
    message: "Rekha Kumar requested 3 days of leave starting next week.",
    createdAt: "2026-08-03T07:45:00Z",
    action: { label: "Review request", prompt: "list leave applications waiting for my approval" },
  },
];

function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const notificationsService = {
  list: (): Promise<NotificationItem[]> => delay([...SAMPLE]),
  markRead: (id: string): Promise<void> => {
    SAMPLE = SAMPLE.map((n) => (n.id === id ? { ...n, read: true } : n));
    return delay(undefined, 100);
  },
};
