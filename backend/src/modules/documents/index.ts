import { MCPModule } from "../../core/types";
import { SCANNED_DOCUMENT_RULES } from "../../systemPrompt/core/scannedDocuments";

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
  description: "Get PDF of any record.",
  tools: [
    {
      name: "document.get_pdf",
      promptRules: [SCANNED_DOCUMENT_RULES],
      description: `Get downloadable PDF link for invoice/quotation/order/etc. entityKey + id from prior list/get call.`,
      module: "document",
      parameters: {
        type: "object",
        properties: {
          entityKey: { type: "string", description: "e.g. sales_invoice, quotation, purchase_order" },
          id: { type: "string", description: "Record id" },
        },
        required: ["entityKey", "id"],
      },
      handler: async (args) => ({
        document: { name: args.id, url: `/api/agent/document-pdf?entityKey=${encodeURIComponent(args.entityKey)}&id=${encodeURIComponent(args.id)}` },
      }),
    },
  ],
};
