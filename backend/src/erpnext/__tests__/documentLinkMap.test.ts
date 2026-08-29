import { ErpNextConnector } from "../erpnextConnector";

// Own dedicated mock, same reasoning as erpnextConnector.aggregate.test.ts's
// own separate mock block: this file's own real interest (the batched
// backfillDocumentLinks lookup) shouldn't have to be threaded through
// every other test file that imports erpnextConnector.ts.
jest.mock("../client", () => ({
  __esModule: true,
  default: {},
  getDocList: jest.fn(),
  getDoc: jest.fn(),
  createDoc: jest.fn(),
  updateDoc: jest.fn(),
  callMethod: jest.fn(),
}));

jest.mock("../../core/settingsService", () => ({
  settingsService: { get: jest.fn() },
}));

const { getDocList, getDoc } = require("../client");
const { settingsService } = require("../../core/settingsService");

// Confirmed live 2026-08-17/18, real user ask: "for all quotation we made
// and converted to sales order" — ERPNext's own real document-chain
// tracking (verified two ways: live deployed data + ERPNext's own public
// source — see documentLinkMap.ts's own doc comment) needed a genuinely
// batched backfill, not a per-row lookup, since report.generate's
// entity_query path can return up to 10,000 rows.
//
// The mechanism here is the SURVIVOR of three disproven attempts (see
// documentLinkMap.ts's doc comment and erpnextConnector.ts's
// backfillDocumentLinks for the full trail): querying the PARENT
// doctype's own get_list with a dotted child-field reference
// ("items.prevdoc_docname"), using the ACTING USER'S credential — not
// the child doctype directly (silently strips fields for anyone,
// confirmed even for Administrator), and not a service-credential
// workaround (never needed once the real mechanism was found).
describe("ErpNextConnector — DOCUMENT_LINK_MAP backfill", () => {
  const connector = new ErpNextConnector();
  const credential = { mode: "api_key", apiKey: "k", apiSecret: "s" } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    settingsService.get.mockResolvedValue(25);
  });

  it("list(): backfills source_quotation via ONE dotted-field query against the PARENT doctype (Sales Order), not the child doctype", async () => {
    // Both the primary fetch AND the backfill query target the SAME
    // doctype ("Sales Order") now — distinguished by whether `fields`
    // contains a dotted child-field reference, not by doctype name.
    getDocList.mockImplementation((doctype: string, params: any) => {
      const fields: string[] = JSON.parse(params.fields ?? "[]");
      if (!fields.some((f) => f.includes("."))) {
        return Promise.resolve([
          { name: "SAL-ORD-2026-00001", customer: "Acme", status: "Completed" },
          { name: "SAL-ORD-2026-00002", customer: "Globex", status: "Completed" },
        ]);
      }
      return Promise.resolve([
        { name: "SAL-ORD-2026-00001", prevdoc_docname: "SAL-QTN-2026-00001" },
        { name: "SAL-ORD-2026-00002", prevdoc_docname: "SAL-QTN-2026-00002" },
      ]);
    });

    const rows = await connector.list("sales_order", credential);

    expect(getDocList).toHaveBeenCalledTimes(2);
    expect(getDocList).toHaveBeenNthCalledWith(
      2,
      "Sales Order", // the PARENT doctype, never "Sales Order Item"
      expect.objectContaining({
        fields: JSON.stringify(["name", "items.prevdoc_docname"]),
        filters: JSON.stringify([["name", "in", ["SAL-ORD-2026-00001", "SAL-ORD-2026-00002"]]]),
        limit_page_length: 0,
      }),
      expect.anything()
    );
    expect(rows[0].source_quotation).toBe("SAL-QTN-2026-00001");
    expect(rows[1].source_quotation).toBe("SAL-QTN-2026-00002");
  });

  it("get(): backfills the same field for a single record", async () => {
    getDocList.mockResolvedValue([{ name: "SAL-ORD-2026-00001", prevdoc_docname: "SAL-QTN-2026-00001" }]);
    getDoc.mockResolvedValue({ name: "SAL-ORD-2026-00001", customer: "Acme", status: "Completed" });

    const row = await connector.get("sales_order", credential, "SAL-ORD-2026-00001");
    expect(row.source_quotation).toBe("SAL-QTN-2026-00001");
  });

  it("multiple link fields on one entity (purchase_invoice) each get their own dotted-field query", async () => {
    getDocList.mockImplementation((doctype: string, params: any) => {
      if (params.fields === undefined || !JSON.parse(params.fields).some((f: string) => f.includes("."))) {
        return Promise.resolve([{ name: "ACC-PINV-2026-00001", supplier: "Acme Supplies", status: "Paid" }]);
      }
      const dottedField = JSON.parse(params.fields)[1] as string; // "items.purchase_order" or "items.purchase_receipt"
      const nativeField = dottedField.split(".")[1];
      return Promise.resolve([{ name: "ACC-PINV-2026-00001", [nativeField]: `${nativeField.toUpperCase()}-VALUE` }]);
    });

    const rows = await connector.list("purchase_invoice", credential);
    // Primary fetch + one dotted-field query per link mapping (this
    // entity has two: source_purchase_order, source_purchase_receipt).
    expect(getDocList).toHaveBeenCalledTimes(3);
    expect(rows[0].source_purchase_order).toBe("PURCHASE_ORDER-VALUE");
    expect(rows[0].source_purchase_receipt).toBe("PURCHASE_RECEIPT-VALUE");
  });

  it("first non-empty value wins when the join returns multiple rows for one parent (the real one-row-per-line-item wrinkle)", async () => {
    getDocList.mockImplementation((doctype: string, params: any) => {
      if (!JSON.parse(params.fields ?? "[]").some((f: string) => f.includes("."))) {
        return Promise.resolve([{ name: "SAL-ORD-2026-00001", customer: "Acme", status: "Completed" }]);
      }
      // Real shape confirmed live: one row per line item, same quotation repeated.
      return Promise.resolve([
        { name: "SAL-ORD-2026-00001", prevdoc_docname: "SAL-QTN-2026-00001" },
        { name: "SAL-ORD-2026-00001", prevdoc_docname: "SAL-QTN-2026-00001" },
        { name: "SAL-ORD-2026-00001", prevdoc_docname: "SAL-QTN-2026-00001" },
      ]);
    });
    const rows = await connector.list("sales_order", credential);
    expect(rows[0].source_quotation).toBe("SAL-QTN-2026-00001");
  });

  it("degrades gracefully (no crash, field just stays absent) if the dotted-field lookup itself fails", async () => {
    getDocList.mockImplementation((doctype: string, params: any) => {
      if (!JSON.parse(params.fields ?? "[]").some((f: string) => f.includes("."))) {
        return Promise.resolve([{ name: "SAL-ORD-2026-00001", customer: "Acme", status: "Completed" }]);
      }
      return Promise.reject(new Error("simulated failure"));
    });
    const rows = await connector.list("sales_order", credential);
    expect(rows).toHaveLength(1);
    expect(rows[0].source_quotation).toBeUndefined();
  });

  it("does nothing extra for an entity with no DOCUMENT_LINK_MAP entry (e.g. quotation itself) — no wasted call", async () => {
    getDocList.mockResolvedValue([{ name: "SAL-QTN-2026-00001", party: "Acme", status: "Open" }]);
    await connector.list("quotation", credential);
    expect(getDocList).toHaveBeenCalledTimes(1); // only the primary fetch
  });

  it("skips the backfill entirely for an empty result set — no pointless call with an empty id list", async () => {
    getDocList.mockResolvedValue([]);
    await connector.list("sales_order", credential);
    expect(getDocList).toHaveBeenCalledTimes(1); // only the (empty) primary fetch
  });
});
