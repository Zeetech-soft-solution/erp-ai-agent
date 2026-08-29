import { EntityConfig } from "../../../../core/types";

export const PURCHASE_INVOICE_ENTITY: EntityConfig = {
    entityKey: "purchase_invoice",
    module: "buying",
    toolPrefix: "purchase_invoice",
    // "date" (posting_date): same gap as sales_invoice — due_date is a
    // due date, not an issue date; without a real issue date "latest
    // invoice" queries have nothing correct to sort/filter on.
    // "source_purchase_order"/"source_purchase_receipt" added
    // 2026-08-17 — see purchase_order's own canonicalFields comment above.
    canonicalFields: ["id", "supplier", "status", "total", "outstanding_amount", "due_date", "per_received", "date", "source_purchase_order", "source_purchase_receipt"],
    fieldValues: { status: ["Draft", "Return", "Debit Note Issued", "Submitted", "Paid", "Partly Paid", "Unpaid", "Overdue", "Cancelled", "Internal Transfer"] },
    linkFields: { supplier: "supplier" },
    operations: ["list", "get"],
    description: "Purchase invoices (bills). \"source_purchase_order\"/\"source_purchase_receipt\" (when present) are the real ids this invoice was created from.",
  };
