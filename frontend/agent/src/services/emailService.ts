import { api } from "../api/client";
import { EmailItem, SentEmailItem } from "./types";

/**
 * Sample data for now - no backend call yet. Swap point for later: replace
 * `list()`'s body with a real request once an email connector exists (see
 * docs/ARCHITECTURE.md's "Support and Email... meant to integrate an
 * external helpdesk/mailbox" note - this is that surface). Reply/action
 * work itself always happens through chat (see pages/Email.tsx), never a
 * method on this service - there's no "fake instant reply" path. Senders
 * are real accounts from the actual employee dataset, not fabricated
 * addresses - so a demo can point at an inbox and the identity behind it
 * is a real, working login.
 */
const SAMPLE: EmailItem[] = [
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
    from: "prakash.nair34@sunriseelectronics.example.in",
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
    from: "vidya.subramaniam16@sunriseelectronics.example.in",
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
  // Real, not sample: whatever the LLM has actually sent via the
  // email.send tool. This is what makes a confirmed reply's outcome
  // visible in the Sent view.
  sent: async (): Promise<SentEmailItem[]> => {
    const { emails } = await api.sentEmails();
    return emails;
  },
  // Real send, direct - calls the email.send tool the same way the LLM
  // would, just without a chat turn in between. Goes through the same
  // rule checks as a chat-confirmed send does.
  send: async (args: { to: string; subject: string; body: string }): Promise<SentEmailItem> => {
    const { data } = await api.callTool("email.send", args);
    return data.sent;
  },
};
