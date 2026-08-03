import { EmailItem } from "./types";

/**
 * Sample data for now - no backend call yet. Swap point for later: replace
 * `list()`/`reply()` bodies with real requests once an email connector
 * exists (see docs/ARCHITECTURE.md's "Support and Email... meant to
 * integrate an external helpdesk/mailbox" note - this is that surface).
 */
let SAMPLE: EmailItem[] = [
  {
    id: "e1",
    from: "amit.pillai52@sunriseelectronics.example.in",
    subject: "Re: Delivery timeline for SA-3000 batch",
    preview: "Thanks for the update - can you confirm the revised delivery date in writing?",
    receivedAt: "2026-08-03T06:40:00Z",
    status: "none",
    quickReplyable: true,
  },
  {
    id: "e2",
    from: "procurement@vermasystems.example.in",
    subject: "PO-2026-00318 - receipt discrepancy",
    preview: "We received 40 units against an order of 50. Please advise on the remaining quantity.",
    receivedAt: "2026-08-02T15:05:00Z",
    status: "none",
    quickReplyable: false,
    action: { label: "Investigate order", prompt: "show me the details of purchase order PO-2026-00318" },
  },
  {
    id: "e3",
    from: "rahul.kapoor50@sunriseelectronics.example.in",
    subject: "Quotation approval needed",
    preview: "Can you approve QTN-2026-00042 before end of day? Customer is waiting.",
    receivedAt: "2026-08-02T11:20:00Z",
    status: "replied",
    quickReplyable: true,
  },
  {
    id: "e4",
    from: "billing@sharmaindustries.example.in",
    subject: "Invoice query - SINV-2026-00981",
    preview: "The invoice total doesn't match our PO. Could you double check the line items?",
    receivedAt: "2026-08-01T09:50:00Z",
    status: "action_taken",
    quickReplyable: false,
    action: { label: "Review invoice", prompt: "show me sales invoice SINV-2026-00981" },
  },
];

function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const emailService = {
  list: (): Promise<EmailItem[]> => delay([...SAMPLE]),
  /** Sends a short auto-generated acknowledgement and marks the thread replied. */
  quickReply: (id: string): Promise<EmailItem> => {
    SAMPLE = SAMPLE.map((e) => (e.id === id ? { ...e, status: "replied" as const } : e));
    return delay(SAMPLE.find((e) => e.id === id)!, 400);
  },
  markActionTaken: (id: string): Promise<EmailItem> => {
    SAMPLE = SAMPLE.map((e) => (e.id === id ? { ...e, status: "action_taken" as const } : e));
    return delay(SAMPLE.find((e) => e.id === id)!, 100);
  },
};
