import { MCPModule } from "../../core/types";

/**
 * Hand-written, cross-cutting module: PDF generation applies to ANY
 * entity backed by a real doctype, not one module's business logic —
 * unlike entityModuleFactory.ts's per-entity tools, this is a single
 * generic tool that takes entityKey as an argument.
 *
 * The tool itself never touches the PDF bytes — it just hands back a
 * URL. The actual generation happens when that URL is fetched (see
 * routes/agent.routes.ts's GET /document-pdf), authenticated the same
 * way as every other API call, at which point systemConnector.getDocumentPdf
 * calls through AS the user, so ERPNext's own document permissions
 * apply exactly as if they'd clicked "Download PDF" themselves.
 */
export const documentsModule: MCPModule = {
  name: "document",
  description: "Get a PDF of a single record.",
  tools: [
    {
      name: "document.get_pdf",
      description:
        "Get a downloadable PDF link for a single record — use this when the user asks for a quotation " +
        "as a PDF or document. entityKey is the canonical entity name (e.g. \"quotation\") " +
        "and id is the record's id, both from a prior list/get call.",
      module: "document",
      parameters: {
        type: "object",
        properties: {
          entityKey: { type: "string", description: "Canonical entity name, e.g. \"quotation\"" },
          id: { type: "string", description: "The record's id" },
        },
        required: ["entityKey", "id"],
      },
      handler: async (args) => ({
        document: { name: args.id, url: `/api/agent/document-pdf?entityKey=${encodeURIComponent(args.entityKey)}&id=${encodeURIComponent(args.id)}` },
      }),
    },
  ],
};
