import { MCPModule } from "../../core/types";

/**
 * STUB — external email MCP. Free tier: placeholder only, so the
 * frontend's Email tab has something to call without erroring. Real
 * send/draft behavior (and the durable send-tracking loop behind it)
 * is a pro-tier capability.
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
      description: "Send an email",
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
      handler: async () => ({ note: "sending not yet implemented — wire real API here" }),
    },
  ],
};
