import { EntityConfig } from "../../../../core/types";

export const NOTIFICATION_LOG_ENTITY: EntityConfig =
  // Real, explicit product ask: "find notification... its process and
  // how we can read in application". ERPNext's own real Notification
  // Log doctype (confirmed live schema) — assignments, mentions, shares,
  // and system alerts addressed to the CURRENT user, the exact same
  // record Frappe's native desk bell icon already reads. Read-only here
  // (list/get) — marking one read is a dedicated action tool
  // (notification_log.mark_read, modules/inboxActions), never a generic
  // update_doc — see entityMaps/support.ts's own doc comment for why a
  // generic write would 403 on the real deployment.
  {
    entityKey: "notification_log",
    // Real fix 2026-08-19 (live regression sweep, user's own explicit
    // call): NOT genuinely "support" domain (that's customer-service
    // tickets) — a notification/assignment/mention is a cross-cutting
    // utility concept that applies regardless of which BUSINESS module
    // it's actually about (a mention on a Quotation is still just a
    // notification). Not a business domain of its own either —
    // "utilities" is the real, single miscellaneous module (calculator,
    // aggregator, chart builder, and this real notification feed, plus
    // its sibling communication/email), see toolRelevanceFilter.ts's own
    // ALWAYS_INCLUDE_MODULES comment for the full history.
    module: "utilities",
    toolPrefix: "notification_log",
    canonicalFields: ["id", "subject", "type", "message", "document_type", "document_name", "from_user", "read", "date"],
    // Fixed 2026-08-25: was missing "Energy Point" (confirmed against the
    // real Notification Log DocField.options, not a comment/memory) —
    // never hand-trim a real Frappe-defined value list.
    fieldValues: { type: ["Mention", "Energy Point", "Assignment", "Share", "Alert"] },
    operations: ["list", "get"],
    description: "A real notification addressed to the current person — an assignment, mention, share, or alert. Use notification_log.mark_read to mark one read after handling it.",
  };
