import { EntityConfig } from "../../../../core/types";

export const PURCHASE_RECEIPT_ENTITY: EntityConfig = {
    entityKey: "purchase_receipt",
    module: "buying",
    toolPrefix: "purchase_receipt",
    // "source_purchase_order" added 2026-08-17. UPDATE to the note this
    // replaces: that comment was right that no HEADER-level
    // "purchase_order" field exists (it's only ever present per line
    // item, confirmed against live schema at the time) — but that's no
    // longer a reason to leave it out. erpnextConnector.ts's
    // backfillDocumentLinks (erpnext/documentLinkMap.ts) now does
    // exactly the batched per-line-item lookup that gap needed; the
    // canonical field is populated from there, never expected as a
    // plain top-level native field.
    canonicalFields: ["id", "supplier", "status", "total", "date", "per_billed", "source_purchase_order"],
    fieldValues: { status: ["Draft", "Partly Billed", "To Bill", "Completed", "Return", "Return Issued", "Cancelled", "Closed"] },
    linkFields: { supplier: "supplier" },
    // Generated from a submitted Purchase Order via ERPNext's own
    // make_purchase_receipt flow — not a document the agent originates
    // from a blank form, same reasoning as delivery_note in stock/entities.ts.
    // No "submit" in operations (deliberately, unlike purchase_order) —
    // the agent never originates this document at all, so a Submit
    // button on it would have nothing real behind it; the pasted
    // autoflow's "Submit" step below silently never appears for anyone
    // as a result (appendAutoflowNextSteps only emits it when
    // "<entityKey>.submit" is actually a registered, allowed tool).
    operations: ["list", "get"],
    // Real fix applied to the pasted draft: status key was "Submitted",
    // which isn't a real value in fieldValues.status above (never
    // matches) — the real post-submit status with nothing billed yet is
    // "To Bill".
    autoflow: {
      next: ["Purchase Invoice"],
      display: {
        Draft: { render: "cards", next_steps: ["Submit"] },
        "To Bill": { render: "cards", next_steps: ["View Invoice"] },
      },
    },
    description: "Goods receipt against purchase order.",
  };
