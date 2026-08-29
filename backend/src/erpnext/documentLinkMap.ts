/**
 * ERPNext's own standard document-chain tracking — every step in the
 * Selling (Quotation -> Sales Order -> Delivery Note -> Sales Invoice)
 * and Buying (Supplier Quotation/Material Request -> Purchase Order ->
 * Purchase Receipt -> Purchase Invoice) cycles remembers where it came
 * from. Verified TWO ways before adding any entry here, not assumed:
 * (1) the real field genuinely populated on this live deployment's data
 * (docker exec ... mariadb DESCRIBE + SELECT), and (2) ERPNext's own
 * public source (frappe/erpnext GitHub, the real DocType JSON) confirms
 * it's a standard, documented Link field, not a customization specific
 * to this one deployment. See project memory 2026-08-17/18 for the full
 * verification trail.
 *
 * The linking field always lives on a CHILD table (e.g. "Sales Order
 * Item"."prevdoc_docname"), never the parent document itself. Confirmed
 * live (real trial and error, not assumed) that querying the child
 * doctype directly — even via the service/Administrator credential —
 * silently strips every requested field down to just "name": Frappe's
 * generic get_list/REST-resource path does not support arbitrary field
 * selection on istable doctypes, for anyone, full stop. The mechanism
 * that actually works: querying the PARENT doctype's own get_list with
 * a DOTTED child-field reference in `fields` (e.g. "items.
 * prevdoc_docname") — real Frappe ORM support for pulling one child-
 * table column via its parent, confirmed against both raw Python
 * (frappe.get_list) and the real REST endpoint
 * (/api/method/frappe.client.get_list), using the ACTING USER'S OWN
 * credential — no service-credential workaround needed at all, since
 * permission is checked against the parent doctype the person already
 * demonstrably has. One real wrinkle: this returns ONE ROW PER CHILD
 * ITEM (a real SQL join), not one per parent — erpnextConnector.ts's
 * backfillDocumentLinks already de-duplicates by parent id (first
 * non-empty value wins), so a Sales Order with 3 line items pointing at
 * the same Quotation collapses to one merged value correctly.
 *
 * `parentChildField` is the real fieldname (fieldtype "Table") on the
 * PARENT doctype holding this child table — verified against ERPNext's
 * own DocType JSON for every entry below, not assumed to universally be
 * "items" even though it happens to be for all six here.
 *
 * ERP-agnostic core/modules code never sees any of this — it only ever
 * sees the canonical field name (e.g. "source_quotation") already
 * populated on the row, same discipline as every other canonical/native
 * split in this file's siblings (entityMap.ts, reportMap.ts).
 *
 * NOT YET COVERED (real, scoped follow-up work, not built speculatively
 * — see project memory): RFQ -> Supplier Quotation, the CRM chain
 * (Lead -> Opportunity -> Quotation), Sales Order -> Work Order and the
 * rest of the manufacturing chain, Purchase Invoice/Receipt -> Asset,
 * and the recruitment chain (Job Applicant -> Interview -> Job Offer).
 * Only add a new entry here after the same two-layer verification this
 * file's own existing entries went through — never guess a field name
 * from the pattern alone.
 */
export interface DocumentLinkMapping {
  /** Canonical field name this becomes on the parent entity's row, e.g. "source_quotation". */
  canonicalField: string;
  /** The real fieldname (fieldtype "Table") on the PARENT doctype holding the child rows, e.g. "items". */
  parentChildField: string;
  /** The real field on that child doctype pointing back at the source document, e.g. "prevdoc_docname". */
  nativeLinkField: string;
  /** Canonical entityKey the linked id refers to, e.g. "quotation" — informational, for callers that want to resolve it further. */
  targetEntity: string;
}

export const DOCUMENT_LINK_MAP: Record<string, DocumentLinkMapping[]> = {
  sales_order: [
    { canonicalField: "source_quotation", parentChildField: "items", nativeLinkField: "prevdoc_docname", targetEntity: "quotation" },
  ],
  purchase_order: [
    { canonicalField: "source_supplier_quotation", parentChildField: "items", nativeLinkField: "supplier_quotation", targetEntity: "supplier_quotation" },
    { canonicalField: "source_material_request", parentChildField: "items", nativeLinkField: "material_request", targetEntity: "material_request" },
  ],
  // Added 2026-08-21 — the RFQ -> Supplier Quotation entry this file's
  // own doc comment already named as a real, scoped, not-yet-built
  // follow-up. Verified the same two ways as every other entry: (1)
  // real, populated columns on the live deployment's own
  // `tabSupplier Quotation Item` (request_for_quotation/
  // request_for_quotation_item — confirmed via a direct MariaDB
  // DESCRIBE), 765 real Purchase Order Item rows chaining all the way
  // through to a real RFQ; (2) a standard, documented ERPNext Link
  // field on Supplier Quotation Item, not a customization.
  supplier_quotation: [
    { canonicalField: "source_rfq", parentChildField: "items", nativeLinkField: "request_for_quotation", targetEntity: "rfq" },
  ],
  delivery_note: [
    { canonicalField: "source_sales_order", parentChildField: "items", nativeLinkField: "against_sales_order", targetEntity: "sales_order" },
    { canonicalField: "source_sales_invoice", parentChildField: "items", nativeLinkField: "against_sales_invoice", targetEntity: "sales_invoice" },
  ],
  purchase_receipt: [
    { canonicalField: "source_purchase_order", parentChildField: "items", nativeLinkField: "purchase_order", targetEntity: "purchase_order" },
  ],
  sales_invoice: [
    { canonicalField: "source_sales_order", parentChildField: "items", nativeLinkField: "sales_order", targetEntity: "sales_order" },
    { canonicalField: "source_delivery_note", parentChildField: "items", nativeLinkField: "delivery_note", targetEntity: "delivery_note" },
  ],
  purchase_invoice: [
    { canonicalField: "source_purchase_order", parentChildField: "items", nativeLinkField: "purchase_order", targetEntity: "purchase_order" },
    { canonicalField: "source_purchase_receipt", parentChildField: "items", nativeLinkField: "purchase_receipt", targetEntity: "purchase_receipt" },
  ],
};
