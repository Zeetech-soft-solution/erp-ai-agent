import { ErpNextEntityMapModule } from "./types";

export const BUYING_MAP: ErpNextEntityMapModule = {
  supplier: {
    doctype: "Supplier",
    // mobile_no/email_id are Read Only mirror fields, blank in this
    // dataset by construction - erpnextConnector.ts's get() backfills
    // from the linked primary Contact when they're empty (see its
    // doc comment).
    fieldMap: { id: "name", display_name: "supplier_name", group: "supplier_group", phone: "mobile_no", email: "email_id" },
  },
  purchase_order: {
    doctype: "Purchase Order",
    // owner/modified: see selling.ts's comment - same reason, feeds the
    // notification poll's "mine, changed since I last checked" filter.
    // source_supplier_quotation: a real, verified field (documentLinkMap.ts's
    // own entry) — ENTITY_CONFIGS already listed it in canonicalFields
    // but this map never had the native mapping, so it silently failed
    // on the relay (confirmed live 2026-08-21). "items.supplier_quotation"
    // is real Frappe dotted child-field syntax — Purchase Order Item's
    // own real "supplier_quotation" column (confirmed via a direct
    // MariaDB DESCRIBE), not a header field on Purchase Order itself.
    // See relayReasoningEngine.ts's own dedup-by-id comment for why a
    // multi-item document can never show up twice from this.
    fieldMap: {
      id: "name", supplier: "supplier", status: "status", total: "grand_total", date: "transaction_date",
      schedule_date: "schedule_date", per_received: "per_received", per_billed: "per_billed",
      owner: "owner", modified: "modified", source_supplier_quotation: "items.supplier_quotation",
    },
    // Purchase Order Item's field names are identical to the canonical
    // ones — confirmed against the live child-table schema.
    childTables: {
      items: {
        nativeField: "items",
        // supplier_quotation added 2026-08-21, alongside the header-level
        // source_supplier_quotation above — a document whose items came
        // from SEVERAL different Supplier Quotations only shows its
        // FIRST item's source at the header level (see relayReasoningEngine.ts's
        // own dedup-by-id comment); the full, real per-item picture is
        // only ever available here, via .get.
        fieldMap: { item_code: "item_code", qty: "qty", uom: "uom", rate: "rate", warehouse: "warehouse", schedule_date: "schedule_date", supplier_quotation: "supplier_quotation" },
      },
    },
  },
  purchase_receipt: {
    doctype: "Purchase Receipt",
    fieldMap: { id: "name", supplier: "supplier", status: "status", total: "grand_total", date: "posting_date", per_billed: "per_billed" },
  },
  purchase_invoice: {
    doctype: "Purchase Invoice",
    fieldMap: {
      id: "name", supplier: "supplier", status: "status", total: "grand_total",
      outstanding_amount: "outstanding_amount", due_date: "due_date", per_received: "per_received",
      date: "posting_date",
    },
  },
  request_for_quotation: {
    doctype: "Request for Quotation",
    fieldMap: { id: "name", status: "status", date: "transaction_date" },
  },
  // Real, severe bug found live 2026-08-20 (RFQ vs supplier_quotation
  // confusion investigation): request_for_quotation.ts is the ONE
  // entity in this whole codebase whose toolPrefix ("rfq") differs from
  // its entityKey ("request_for_quotation") — entityModuleFactory.ts
  // builds the real, model-facing tool NAME from toolPrefix, so the
  // actual callable tool is "rfq.list"/"rfq.get". But relayCallTranslator.ts's
  // translateToolCall() resolves entityKey by naively splitting the
  // tool name on "." (`toolName.slice(0, dotIndex)`), which gives "rfq"
  // — and RELAY_READ_TOOLS (relayReasoningEngine.ts) is derived from
  // THIS map's own keys, so without this alias, "rfq.list"/"rfq.get"
  // were BOTH genuinely uncallable on the relay: rejected outright by
  // the tenant-tier gate (never even reaching translateToolCall), and
  // would ALSO have thrown "No entity mapping" if that gate were ever
  // bypassed. Confirmed via a debug-instrumented test: isRelayAllowed
  // returned false for "rfq.get" with RELAY_READ_TOOLS.has() false. A
  // plain analytics.aggregate call (whose entityKey is a real MODEL
  // ARGUMENT, "request_for_quotation", validated against ENTITY_CONFIGS'
  // own real entityKey list, not the tool-name split) never hit this —
  // exactly why "how many RFQs are draft" worked live while "show me
  // the RFQs" never did. This alias is the real fix: same mapping
  // object, reachable under the name the real tool actually uses.
  rfq: {
    doctype: "Request for Quotation",
    fieldMap: { id: "name", status: "status", date: "transaction_date" },
  },
  supplier_quotation: {
    doctype: "Supplier Quotation",
    // source_rfq: real, verified 2026-08-21 (documentLinkMap.ts's own
    // entry) — Supplier Quotation Item's real "request_for_quotation"
    // column (confirmed via a direct MariaDB DESCRIBE + 765 real
    // Purchase Order Item rows chaining all the way through to a real
    // RFQ), same dotted child-field mechanism as purchase_order's own
    // source_supplier_quotation above.
    fieldMap: { id: "name", supplier: "supplier", status: "status", total: "grand_total", date: "transaction_date", source_rfq: "items.request_for_quotation" },
    // Added 2026-08-12, mirrors quotation's own childTables in
    // selling.ts exactly — same reasoning: a real Purchase Order should
    // pull its items from the supplier's actual Supplier Quotation
    // (the response to our RFQ) via supplier_quotation.get, never have
    // them invented from a scanned document or hand-typed guess. Field
    // names confirmed against the live "Supplier Quotation Item" child
    // doctype schema, not assumed — identical to Quotation Item/Purchase
    // Order Item's own field names.
    childTables: {
      // request_for_quotation added 2026-08-21, alongside the header-level
      // source_rfq above — same "first item wins at the header, full
      // per-item detail only via .get" split as purchase_order's own
      // source_supplier_quotation.
      items: { nativeField: "items", fieldMap: { item_code: "item_code", qty: "qty", uom: "uom", rate: "rate", warehouse: "warehouse", request_for_quotation: "request_for_quotation" } },
    },
  },
  landed_cost_voucher: {
    doctype: "Landed Cost Voucher",
    fieldMap: { id: "name", date: "posting_date", total_taxes_and_charges: "total_taxes_and_charges" },
  },
  subcontracting_order: {
    doctype: "Subcontracting Order",
    fieldMap: { id: "name", supplier: "supplier", status: "status", date: "transaction_date", per_received: "per_received" },
  },
  subcontracting_receipt: {
    doctype: "Subcontracting Receipt",
    fieldMap: { id: "name", supplier: "supplier", status: "status", date: "posting_date", total: "total" },
  },
};
