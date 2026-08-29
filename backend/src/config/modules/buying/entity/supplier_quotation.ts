import { EntityConfig } from "../../../../core/types";

export const SUPPLIER_QUOTATION_ENTITY: EntityConfig = {
    entityKey: "supplier_quotation",
    module: "buying",
    toolPrefix: "supplier_quotation",
    // "items" added 2026-08-12, mirrors quotation's own "items" exactly
    // (see that entity's own doc comment) — only populated by
    // supplier_quotation.get on one specific id, never by
    // supplier_quotation.list (same Frappe list-endpoint limitation:
    // child-table data is never returned for ANY doctype's list call,
    // regardless of row count).
    // "source_rfq" added 2026-08-21: the real RFQ this quotation is a
    // reply to (Supplier Quotation Item's own "request_for_quotation"
    // field, a real, verified dotted child-field lookup — see
    // erpnext/documentLinkMap.ts and entityMaps/buying.ts's own doc
    // comments) — closes a real, confirmed gap: there was previously no
    // way at all to answer "which RFQs got a reply/purchase order".
    canonicalFields: ["id", "supplier", "status", "total", "date", "items", "source_rfq"],
    fieldValues: { status: ["Draft", "Submitted", "Stopped", "Cancelled", "Expired"] },
    linkFields: { supplier: "supplier", source_rfq: "rfq" },
    lineItems: { canonicalField: "items", itemFields: ["item_code", "qty", "uom", "rate", "warehouse"] },
    operations: ["list", "get"],
    // 2026-08-23: description cut to a one-liner. Real fact kept in
    // this comment, not the prompt: this is the ONLY entity whose real
    // description used to literally contain the word "RFQ" (a confirmed
    // 2026-08-20 live bug — "show me the RFQs" wrongly resolved here
    // instead of request_for_quotation) — worth rechecking live if that
    // exact confusion resurfaces now that the explicit reword is gone.
    description: "Supplier's reply to our RFQ. View-only. Use supplier_quotation.get for items. Convert to Purchase Order.",
  };
