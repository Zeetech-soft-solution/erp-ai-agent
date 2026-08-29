import { EntityConfig } from "../../../../core/types";

export const SALES_ORDER_ENTITY: EntityConfig = {
    entityKey: "sales_order",
    module: "selling",
    toolPrefix: "sales_order",
    // "source_quotation" added 2026-08-17 — real ERPNext document-chain
    // tracking (Sales Order Item.prevdoc_docname), NOT a plain top-level
    // field — populated by erpnextConnector.ts's backfillDocumentLinks
    // (see erpnext/documentLinkMap.ts), never by the normal native
    // fetch. Verified two ways (live deployment data + ERPNext's own
    // public source) before adding — see that file's own doc comment.
    canonicalFields: ["id", "customer", "status", "total", "date", "delivery_date", "per_delivered", "per_billed", "source_quotation"],
    fieldValues: { status: ["Draft", "On Hold", "To Pay", "To Deliver and Bill", "To Bill", "To Deliver", "Completed", "Cancelled", "Closed"] },
    linkFields: { customer: "customer" },
    createFields: ["customer"],
    lineItems: { canonicalField: "items", itemFields: ["item_code", "qty", "uom", "rate", "warehouse", "delivery_date"] },
    // 2026-08-23: added "submit" (see erpnextConnector.ts's own doc
    // comment on the real docstatus 0->1 transition) so autoflow's
    // Draft->Submit step below has a real tool behind it.
    operations: ["list", "get", "create", "update", "submit"],
    // Real fix applied to the pasted draft: status key was "Submitted",
    // which doesn't exist in fieldValues.status above at all — the real
    // post-submit status with nothing delivered/billed yet is
    // "To Deliver and Bill" (same class of fix as purchase_order's own
    // autoflow). Also added render:"cards" to each entry, required by
    // EntityConfig.autoflow's own type but omitted in the paste.
    autoflow: {
      next: ["Delivery Note", "Sales Invoice"],
      display: {
        Draft: { render: "cards", next_steps: ["Submit"] },
        "To Deliver and Bill": { render: "cards", next_steps: ["View Delivery"] },
      },
    },
    // 2026-08-23: description cut — see sales_invoice.ts's own note for
    // the same real "Pioneer" fuzzy-name ambiguity this used to warn
    // about explicitly.
    description: "Confirmed customer order. Auto: SO → Delivery Note → Sales Invoice. source_quotation = converted from.",
  };
