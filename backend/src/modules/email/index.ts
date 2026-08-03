import { MCPModule } from "../../core/types";
import { mailboxConnector } from "../../providers/mail/stubMailboxConnector";

/**
 * STUB — external email MCP, backed by providers/mail/ (see
 * stubMailboxConnector.ts for exactly where a real IMAP/SMTP or Gmail/
 * Graph implementation plugs in). "list" is read-only; "draft" composes
 * but does not send. "send" DOES actually record a send (durably, via
 * mailboxConnector.send -> sentEmailStore) so the demo has a real,
 * inspectable loop — the frontend's Email tab Sent view reads it back —
 * but it's still a stub in that no real delivery happens yet.
 */
export const emailModule: MCPModule = {
  name: "email",
  description: "Read, draft, and send email (external MCP)",
  tools: [
    {
      name: "email.list",
      description: "List recent emails for the current user",
      module: "email",
      parameters: { type: "object", properties: { folder: { type: "string" } } },
      handler: async () => ({ note: "email MCP not yet connected — wire real API here" }),
    },
    {
      name: "email.draft",
      description: "Draft an email reply without sending it",
      module: "email",
      parameters: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } } },
      handler: async (args) => ({ note: "drafting not yet implemented", draft: args }),
    },
    {
      name: "email.send",
      description: "Send an email — only call this after the user has confirmed the drafted reply's content",
      module: "email",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
      handler: async (args, session) => {
        const sent = await mailboxConnector.send(session.sub, { to: args.to, subject: args.subject, body: args.body });
        return { ok: true, sent };
      },
    },
  ],
};
