import { SupportTicket } from "./types";

/** Sample data for now - no backend call yet. Swap point: replace `list()`
 *  with a real request once a helpdesk connector exists (this is the
 *  `tickets.*` module's eventual UI surface - see backend
 *  `src/modules/tickets/`). Resolving a ticket always happens through chat
 *  (see pages/Support.tsx), never a method here - same "no fake instant
 *  action" rule as Email. */
const SAMPLE: SupportTicket[] = [
  {
    id: "t1",
    subject: "Product not powering on",
    requester: "Rao Electricals",
    priority: "High",
    status: "none",
    createdAt: "2026-08-03T05:10:00Z",
    action: { label: "Check warranty status", prompt: "look up the customer record for Rao Electricals" },
  },
  {
    id: "t2",
    subject: "Delayed delivery query",
    requester: "Sharma Traders",
    priority: "Medium",
    status: "none",
    createdAt: "2026-08-02T13:22:00Z",
    action: { label: "Check order status", prompt: "list open sales orders for Sharma Traders" },
  },
  {
    id: "t3",
    subject: "Invoice mismatch",
    requester: "Gupta Electricals",
    priority: "Medium",
    status: "action_taken",
    createdAt: "2026-08-01T10:05:00Z",
    action: { label: "Review invoice", prompt: "list recent sales invoices for Gupta Electricals" },
  },
  {
    id: "t4",
    subject: "Bulk order enquiry",
    requester: "Menon Industries",
    priority: "Low",
    status: "resolved",
    createdAt: "2026-07-31T08:40:00Z",
  },
];

function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const supportService = {
  list: (): Promise<SupportTicket[]> => delay([...SAMPLE]),
};
