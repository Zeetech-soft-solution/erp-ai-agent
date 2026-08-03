import { MCPModule } from "../../core/types";
import { workflowActionStore } from "../../core/workflowActionStore";

/**
 * STUB — external support-desk MCP. "list" is a placeholder (wire a real
 * ticketing API here). "resolve" DOES actually record a resolution
 * (durably, via workflowActionStore) once the user has confirmed it in
 * chat - same discipline as email.send: never claim something is done
 * without a tool call backing it up.
 */
export const ticketsModule: MCPModule = {
  name: "tickets",
  description: "Read support tickets and record resolutions (external MCP)",
  tools: [
    {
      name: "tickets.list",
      description: "List support tickets assigned to the current user",
      module: "tickets",
      parameters: { type: "object", properties: { status: { type: "string" } } },
      handler: async () => ({ note: "tickets MCP not yet connected — wire real API here" }),
    },
    {
      name: "tickets.resolve",
      description: "Record a support ticket as resolved — only call this after the user has confirmed the proposed resolution",
      module: "tickets",
      parameters: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "The ticket's identifier" },
          resolutionNote: { type: "string", description: "What was done to resolve it" },
        },
        required: ["ticketId", "resolutionNote"],
      },
      handler: async (args, session) => {
        const resolved = await workflowActionStore.push(session.sub, {
          module: "tickets",
          recordKey: args.ticketId,
          action: "resolve",
          detail: args.resolutionNote,
        });
        return { ok: true, resolved };
      },
    },
  ],
};
