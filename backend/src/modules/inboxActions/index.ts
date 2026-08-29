import { MCPModule } from "../../core/types";
import { systemConnector } from "../../config/system.config";
import { INBOX_RULES } from "../../systemPrompt/core/inbox";

/**
 * Hand-written, same discipline as modules/paymentEntry/index.ts: real
 * actions on top of already-existing read entities (communication,
 * notification_log — config/modules/support/entity/) that don't fit
 * entityModuleFactory's generic create/update shape, because ERPNext
 * itself doesn't let a generic write reach any of these the normal way:
 *
 * - communication.reply sends a genuine outbound email (frappe.core.
 *   doctype.communication.email.make — the exact function ERPNext's own
 *   desk "Reply" button calls), not a raw Communication insert(). A
 *   plain create_doc against "Communication" would leave a record that
 *   LOOKS like an email but was never actually sent through SMTP — the
 *   real "investigate + reply" ask this closes needs a genuine sent
 *   email, not a database row shaped like one.
 * - communication.send is the same real dispatch, but for a brand-new
 *   thread (no in_reply_to) — added 2026-08-19 per an explicit product
 *   ask, deliberately deferring PDF-attachment support on this one.
 * - notification_log.mark_read calls Frappe's own privileged
 *   mark_as_read() — Notification Log's real DocPerm grants "All" read/
 *   share but deliberately NO write at all (Frappe routes this specific
 *   mutation through that whitelisted function instead, scoped to the
 *   calling user's own for_user rows), so a generic update_doc against
 *   it would 403 for every real, ordinary user.
 *
 * Registered under its own module name ("inbox_actions") to avoid
 * colliding with the generic entityModuleFactory-built "communication"/
 * "notification_log" modules (list/get) — only tool NAMES have to be
 * globally unique (moduleRegistry.findTool), so these still read as a
 * natural <entity>.<action> pair.
 */
// entityKey+ruleAction on all three tools below are NOT descriptive
// text — gateway.ts/relayReasoningEngine.ts both check
// `tool.entityKey && tool.ruleAction` to run real per-tenant
// businessRuleEngine enforcement before an irreversible send/mutation.
// Dropping them (not just their description) would silently disable
// that enforcement for these three tools — kept regardless of how
// short the description text gets.
//
// module: "utilities" on all three (not a domain-shaped module of its
// own) and the real "inbox_actions" module NAME here (not in
// MODULE_KEYWORDS/ALWAYS_INCLUDE_MODULES) are both real fixes from a
// 2026-08-19 regression sweep — see toolRelevanceFilter.ts's own
// ALWAYS_INCLUDE_MODULES comment for the full history.
export const inboxActionsModule: MCPModule = {
  name: "inbox_actions",
  description: "Email & notifications.",
  tools: [
    {
      name: "communication.reply",
      description: `Reply to email. communicationId + replyBody. attachPrintFormat optional.`,
      module: "utilities",
      promptRules: [INBOX_RULES],
      entityKey: "communication",
      ruleAction: "create",
      parameters: {
        type: "object",
        properties: { communicationId: { type: "string" }, replyBody: { type: "string" }, attachPrintFormat: { type: "string" } },
        required: ["communicationId", "replyBody"],
      },
      handler: (args, session) =>
        systemConnector.replyToCommunication(session.credential, {
          communicationId: args.communicationId,
          replyBody: args.replyBody,
          attachPrintFormat: args.attachPrintFormat,
        }),
    },
    {
      name: "communication.send",
      description: `Send new email. recipients + subject + body.`,
      module: "utilities",
      promptRules: [INBOX_RULES],
      entityKey: "communication",
      ruleAction: "create",
      parameters: {
        type: "object",
        properties: { recipients: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
        required: ["recipients", "subject", "body"],
      },
      handler: (args, session) =>
        systemConnector.sendCommunication(session.credential, {
          recipients: args.recipients,
          subject: args.subject,
          body: args.body,
        }),
    },
    {
      name: "notification_log.mark_read",
      description: `Mark notification read. notificationId.`,
      module: "utilities",
      promptRules: [INBOX_RULES],
      entityKey: "notification_log",
      ruleAction: "update",
      parameters: {
        type: "object",
        properties: { notificationId: { type: "string" } },
        required: ["notificationId"],
      },
      handler: (args, session) => systemConnector.markNotificationRead(session.credential, args.notificationId),
    },
  ],
};
