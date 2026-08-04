import { MCPModule } from "../../core/types";

/**
 * STUB — external support-desk MCP. Free tier: placeholder only, so
 * the frontend's Support tab has something to call without erroring.
 * Real resolution-tracking behavior is a pro-tier capability.
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
      description: "Record a support ticket as resolved",
      module: "tickets",
      parameters: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "The ticket's identifier" },
          resolutionNote: { type: "string", description: "What was done to resolve it" },
        },
        required: ["ticketId", "resolutionNote"],
      },
      handler: async () => ({ note: "resolution tracking not yet implemented — wire real API here" }),
    },
  ],
};
