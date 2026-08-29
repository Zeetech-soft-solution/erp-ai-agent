import { EntityConfig } from "../../../../core/types";

export const REQUEST_FOR_QUOTATION_ENTITY: EntityConfig = {
    entityKey: "request_for_quotation",
    module: "buying",
    toolPrefix: "rfq",
    canonicalFields: ["id", "status", "date"],
    fieldValues: { status: ["Draft", "Submitted", "Cancelled"] },
    operations: ["list", "get"],
    // Real bug found live 2026-08-20: this description never used the
    // word "RFQ" at all, while supplier_quotation.ts's own description
    // said "replying to our own RFQ" — so a plain "show me the RFQs"
    // question consistently (confirmed 100% reproducible) resolved to
    // supplier_quotation instead of THIS entity, the actual RFQ
    // document. "RFQ" is the far more common real term for this
    // doctype than its full spelled-out name — stated explicitly now.
    description: "RFQs (Requests for Quotation) — the document WE send OUT to suppliers asking for pricing. " +
      "Not the supplier's reply to it (that's supplier_quotation instead).",
  };
