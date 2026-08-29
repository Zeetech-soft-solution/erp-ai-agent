import { EntityConfig } from "../../../../core/types";

export const SALES_INVOICE_ENTITY: EntityConfig = {
    entityKey: "sales_invoice",
    module: "selling",
    toolPrefix: "sales_invoice",
    // "date" (posting_date) was missing entirely — without it, "latest
    // invoice"/"invoices from last week" had nothing to sort or filter
    // on and silently came back empty. due_date is a due-date, not an
    // issue date; the two are unrelated for this purpose.
    // "source_sales_order"/"source_delivery_note" added 2026-08-17 — see
    // sales_order's own canonicalFields comment above for the full story.
    canonicalFields: ["id", "customer", "status", "total", "outstanding_amount", "due_date", "date", "source_sales_order", "source_delivery_note"],
    // Reverted 2026-08-25 (explicit product decision: never hand-trim a
    // real Frappe-defined value list) — the 2026-08-24 curation down to
    // 4 values was itself reverted back to the full real ERPNext-defined
    // set. A value unused in THIS tenant's data can still be genuinely
    // real for a different tenant on the platform — same reasoning that
    // already killed the separate live-enum-discovery feature the same
    // prior session (search_schema showing only a tenant's actually-used
    // values). Full static list, not a live fetch, not a curated subset.
    fieldValues: { status: ["Draft", "Return", "Credit Note Issued", "Submitted", "Paid", "Partly Paid", "Unpaid", "Unpaid and Discounted", "Partly Paid and Discounted", "Overdue and Discounted", "Overdue", "Cancelled", "Internal Transfer"] },
    linkFields: { customer: "customer" },
    operations: ["list", "get"],
    // "paid_amount" is a real native ERPNext field but NOT exposed here
    // — confirmed live it's always 0 in this real dataset, even on
    // fully-Paid invoices (erpdatabuild never populates it), so mapping
    // it would just be a trap. "Amount paid" is total minus
    // outstanding_amount instead — get both via two analytics.aggregate/
    // execute_query sum calls, then analytics.calculate to subtract (the
    // real DERIVED workflow ANALYTICS_RULES already teaches), never a
    // single sum of one field.
    description: "Sales invoice sent to customer. status is a payment status (Paid/Unpaid/Overdue).",
  };
