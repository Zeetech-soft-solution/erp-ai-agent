import { EntityConfig } from "../../../../core/types";

export const POS_INVOICE_ENTITY: EntityConfig = {
    entityKey: "pos_invoice",
    module: "selling",
    toolPrefix: "pos_invoice",
    canonicalFields: ["id", "customer", "status", "total", "date", "outstanding_amount"],
    fieldValues: { status: ["Draft", "Return", "Credit Note Issued", "Consolidated", "Submitted", "Paid", "Partly Paid", "Unpaid", "Partly Paid and Discounted", "Unpaid and Discounted", "Overdue and Discounted", "Overdue", "Cancelled"] },
    linkFields: { customer: "customer" },
    // Generated at the point of sale — requires a POS Profile/opened
    // session context this simple header-only tool can't guarantee, so
    // kept read-only like the other point-in-time financial documents
    // (sales_invoice, purchase_invoice).
    operations: ["list", "get"],
    description: "Point-of-sale invoices for walk-in/retail sales",
  };
