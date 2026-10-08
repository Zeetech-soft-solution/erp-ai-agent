import { MCPModule } from "../../core/types";
import { KnowledgeStore } from "../../core/knowledgeStore";
import { systemConnector } from "../../config/system.config";
import { embedder } from "../../embedder";

const store = new KnowledgeStore(embedder);

/**
 * Knowledge (RAG) tools. Two different questions, two tools:
 * - knowledge.search: "how does this flow work in ERPNext?" Semantic search
 *   over the reference documents in backend/knowledge (standard flows,
 *   what each document does, what submit/cancel/amend mean).
 * - workflow.describe: "what is the state of THIS document and what can
 *   happen next?" Read live from the customer's own ERPNext workflow.
 * The model reads both results and decides its next step itself; ERPNext
 * stays the authority for anything it then does.
 */
export const knowledgeModule: MCPModule = {
  name: "knowledge",
  description: "ERP process knowledge (RAG) and live approval workflow",
  tools: [
    {
      name: "knowledge.search",
      description:
        "Semantic search over the ERP process knowledge base: how standard ERPNext flows work (order to cash, procure to pay, stock, manufacturing, accounting close, HR, approvals), what a document type is for, which document comes next, what submit/cancel/amend do. Use it when you need to understand a process before acting or to explain one. Returns passages with their source titles; cite the title.",
      module: "knowledge",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The question in plain words" },
          module: { type: "string", description: "Optional module filter: crm, selling, buying, stock, accounting, hr, manufacturing, projects, assets, quality, support" },
          top_k: { type: "number", description: "Passages to return (default 5, max 10)" },
        },
        required: ["query"],
      },
      handler: async (args) => {
        const hits = await store.search(args.query, { module: args.module, topK: args.top_k });
        return { query: args.query, passages: hits };
      },
    },
    {
      name: "workflow.describe",
      description:
        "Reads the approval workflow ERPNext has configured for an entity (states, transitions, which role may act) and, when an id is given, that document's current state and the actions available to the signed-in user right now. Use before moving a document forward or when asked what is pending or who must approve.",
      module: "knowledge",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", description: "Canonical entity key, e.g. purchase_order, leave_application" },
          id: { type: "string", description: "Optional document id to get its current state and available actions" },
        },
        required: ["entity"],
      },
      handler: async (args, session) => {
        if (!systemConnector.describeWorkflow) return { entity: args.entity, supported: false };
        return systemConnector.describeWorkflow(args.entity, session.credential, args.id);
      },
    },
  ],
};
