import { EntityConfig } from "../../../../core/types";

export const PURCHASE_ORDER_ENTITY: EntityConfig = {
    entityKey: "purchase_order",
    module: "buying",
    toolPrefix: "purchase_order",
    // "source_supplier_quotation"/"source_material_request" added
    // 2026-08-17 — same real document-chain backfill as sales_order's
    // "source_quotation" (see erpnext/documentLinkMap.ts), verified the
    // same two ways before adding.
    canonicalFields: ["id", "supplier", "status", "total", "date", "schedule_date", "per_received", "per_billed", "source_supplier_quotation", "source_material_request"],
    // Queried from live ERPNext's DocField.options 2026-08-09 — see
    // core/types.ts's EntityConfig.fieldValues doc comment for why.
    fieldValues: { status: ["Draft", "On Hold", "To Receive and Bill", "To Bill", "To Receive", "Completed", "Cancelled", "Closed", "Delivered"] },
    linkFields: { supplier: "supplier", source_supplier_quotation: "supplier_quotation" },
    createFields: ["supplier"],
    lineItems: { canonicalField: "items", itemFields: ["item_code", "qty", "uom", "rate", "warehouse", "schedule_date"] },
    // 2026-08-23: added "submit" (real docstatus 0->1 transition, see
    // erpnextConnector.ts's own doc comment) so autoflow's Draft->Submit
    // step below has a real tool behind it.
    operations: ["list", "get", "create", "update", "submit"],
    // Real, config-driven next-steps for a single-record card — real
    // fix applied to the pasted draft: the status key was "Submitted",
    // which doesn't exist in fieldValues.status above at all (would
    // never match, a permanently dead entry) — the real post-submit
    // status with nothing received/billed yet is "To Receive and Bill".
    autoflow: {
      next: ["Purchase Receipt", "Purchase Invoice"],
      display: {
        Draft: { render: "cards", next_steps: ["Submit"] },
        "To Receive and Bill": { render: "cards", next_steps: ["View Receipt", "View Invoice"] },
      },
    },
    description: "Purchase orders sent to suppliers.",
  };
