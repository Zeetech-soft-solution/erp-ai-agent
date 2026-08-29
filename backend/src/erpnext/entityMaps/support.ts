import { ErpNextEntityMapModule } from "./types";

export const SUPPORT_MAP: ErpNextEntityMapModule = {
  issue: {
    doctype: "Issue",
    fieldMap: {
      id: "name",
      subject: "subject",
      customer: "customer",
      customer_name: "customer_name",
      contact: "contact",
      raised_by: "raised_by",
      status: "status",
      priority: "priority",
      opening_date: "opening_date",
      description: "description",
      date: "opening_date",
    },
  },
  // Real, explicit product ask: a tenant's own actual email inbox — NOT
  // erp-agent-pro's own emailModule (modules/email/index.ts), which is
  // a deliberately different, hand-written thing reading a SIMULATED,
  // centrally-shared demo table (business_emails) — that can never be
  // right for a real per-tenant SaaS customer's own real inbox. This
  // instead maps ERPNext's own real "Communication" doctype (confirmed
  // against the live schema, not guessed) — every real tenant already
  // gets one of these per inbound/outbound email the instant their own
  // Email Account is configured, no separate simulated data needed.
  // entityKey deliberately "communication", not "email" — "email" is
  // already taken by the module above, a different, real, unrelated
  // thing this must never collide with.
  communication: {
    doctype: "Communication",
    fieldMap: {
      id: "name",
      subject: "subject",
      sender: "sender",
      sender_name: "sender_full_name",
      recipients: "recipients",
      body: "text_content",
      date: "communication_date",
      direction: "sent_or_received",
      reference_doctype: "reference_doctype",
      reference_name: "reference_name",
      read: "seen",
    },
  },
  // Real, explicit product ask: "find notification... how we can read
  // in application". Maps ERPNext's own real "Notification Log" doctype
  // — the SAME record Frappe's native desk bell/notification panel
  // already reads (confirmed against the live schema + controller, not
  // guessed) — not a bespoke table. Read-only here (list/get) on
  // purpose, same reasoning as communication above: "mark as read" is
  // not a generic field edit (Notification Log's own real DocPerm grants
  // "All" read/share but NO write at all — Frappe deliberately routes
  // mutation through its own privileged `mark_as_read`/`mark_all_as_read`
  // whitelisted functions, which bypass normal DocPerm on purpose since
  // they only ever touch the CALLING user's own for_user rows). A real
  // dedicated action tool (notification_log.mark_read, modules/
  // inboxActions) calls those functions directly instead of a generic
  // update_doc, which would 403 on the real deployment.
  notification_log: {
    doctype: "Notification Log",
    fieldMap: {
      id: "name",
      subject: "subject",
      type: "type",
      message: "email_content",
      document_type: "document_type",
      document_name: "document_name",
      from_user: "from_user",
      read: "read",
      date: "creation",
    },
  },
};
