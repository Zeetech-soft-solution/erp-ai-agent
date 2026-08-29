import { EntityConfig } from "../../../../core/types";

export const DELIVERY_NOTE_ENTITY: EntityConfig = {
    entityKey: "delivery_note",
    module: "stock",
    toolPrefix: "delivery_note",
    // "source_sales_order"/"source_sales_invoice" added 2026-08-17 — real
    // ERPNext document-chain tracking (Delivery Note Item's
    // against_sales_order/against_sales_invoice), backfilled by
    // erpnextConnector.ts's backfillDocumentLinks — see
    // erpnext/documentLinkMap.ts's own doc comment for the full
    // verification story.
    canonicalFields: ["id", "customer", "status", "total", "date", "per_billed", "per_returned", "source_sales_order", "source_sales_invoice"],
    fieldValues: { status: ["Draft", "To Bill", "Partially Billed", "Completed", "Return", "Return Issued", "Cancelled", "Closed"] },
    linkFields: { customer: "customer" },
    // Generated from a submitted Sales Order via ERPNext's own
    // make_delivery_note flow — not a document the agent originates
    // from a blank form.
    operations: ["list", "get"],
    description: "Outbound goods delivery documents. \"source_sales_order\"/\"source_sales_invoice\" (when present) are the real ids this was generated from.",
  };
