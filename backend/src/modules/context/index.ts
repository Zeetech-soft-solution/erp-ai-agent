import { MCPModule } from "../../core/types";
import { vectorContextProvider } from "../../providers/context/vectorContextProvider";

/**
 * Exposes the COLD tier as explicit, callable tools — this is the
 * "LLM asks the server for more detail" pattern discussed: rather than
 * pushing everything into context automatically, the model can choose
 * to search or look up something specific mid-reasoning.
 */
export const contextModule: MCPModule = {
  name: "context",
  description: "Search and retrieve additional context on demand",
  tools: [
    {
      name: "context.search",
      description: "Semantic search over past conversations, notes, tickets, and KB docs",
      module: "context",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      handler: async (args, session) => vectorContextProvider.fetch(session, args.query, 4000),
    },
    {
      name: "context.lookup",
      description: "Fetch full detail for a specific known entity (by id/label) when a summary isn't enough",
      module: "context",
      parameters: { type: "object", properties: { label: { type: "string" } }, required: ["label"] },
      handler: async (args, session) => vectorContextProvider.fetch(session, args.label, 4000),
    },
  ],
};
