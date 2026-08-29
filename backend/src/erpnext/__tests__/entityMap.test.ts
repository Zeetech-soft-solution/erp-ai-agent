import { ENTITY_ALIASES } from "../../config/entities.config";
import { ERPNEXT_ENTITY_MAP, entityKeyForDoctype, nativeFields, toNativeData, toNativeFilters, toCanonicalRow } from "../entityMap";

describe("ERPNEXT_ENTITY_MAP assembly", () => {
  it("assembles a non-empty map spanning multiple modules", () => {
    expect(Object.keys(ERPNEXT_ENTITY_MAP).length).toBeGreaterThan(20);
  });

  it("has no duplicate entityKey across the spread module maps", () => {
    // A silent duplicate key would mean the later module's spread quietly
    // clobbered the earlier one's mapping — this makes that visible by
    // comparing against the sum of each module's own key count.
    const modules = ["crm", "selling", "buying", "stock", "accounting", "hr", "manufacturing", "projects", "assets", "quality", "support", "notifications"];
    // Re-require each module map to count its own keys independently.
    let total = 0;
    for (const name of modules) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(`../entityMaps/${name}`);
      const mapExport = Object.values(mod)[0] as Record<string, unknown>;
      total += Object.keys(mapExport).length;
    }
    // + the natural-language alias keys entityMap.ts folds in on top
    // (ENTITY_ALIASES — "invoice" -> sales_invoice, ...), each pointed
    // at an existing target's own mapping object.
    const aliasesInMap = Object.keys(ENTITY_ALIASES).filter((a) => a in ERPNEXT_ENTITY_MAP).length;
    expect(Object.keys(ERPNEXT_ENTITY_MAP).length).toBe(total + aliasesInMap);
  });

  it("every mapping has a doctype and a non-empty fieldMap", () => {
    for (const [entityKey, mapping] of Object.entries(ERPNEXT_ENTITY_MAP)) {
      expect(mapping.doctype).toBeTruthy();
      expect(Object.keys(mapping.fieldMap).length).toBeGreaterThan(0);
      // sanity: fieldMap always includes an "id" canonical key mapped to
      // ERPNext's "name" — every doctype's real primary key — since
      // every *.get/*.list caller relies on this to identify a row.
      expect(mapping.fieldMap.id).toBe("name");
      void entityKey;
    }
  });
});

describe("entityKeyForDoctype", () => {
  it("reverse-resolves a known doctype back to its canonical entityKey", () => {
    expect(entityKeyForDoctype("Quotation")).toBe("quotation");
    expect(entityKeyForDoctype("Purchase Order")).toBe("purchase_order");
  });

  it("returns undefined for a doctype with no mapping", () => {
    expect(entityKeyForDoctype("Not A Real Doctype")).toBeUndefined();
  });
});

describe("nativeFields", () => {
  it("returns the ERPNext-native field names for a known entity", () => {
    const fields = nativeFields("quotation");
    expect(fields).toEqual(expect.arrayContaining(["name", "party_name", "status", "grand_total"]));
  });

  it("throws for an unknown entityKey rather than returning an empty list", () => {
    expect(() => nativeFields("not_a_real_entity")).toThrow(/No ERPNext entity mapping/);
  });
});

describe("universal canonical `date`", () => {
  it("every mapped entity resolves a native `date` column — so 'the latest X' works on any doctype", () => {
    const missing = Object.entries(ERPNEXT_ENTITY_MAP)
      .filter(([, mapping]) => !mapping.fieldMap.date)
      .map(([entityKey]) => entityKey);
    expect(missing).toEqual([]);
  });

  it("a transactional entity keeps its real business date, not `creation`", () => {
    expect(ERPNEXT_ENTITY_MAP.purchase_order.fieldMap.date).toBe("transaction_date");
    expect(ERPNEXT_ENTITY_MAP.work_order.fieldMap.date).toBe("planned_start_date");
    expect(ERPNEXT_ENTITY_MAP.issue.fieldMap.date).toBe("opening_date");
    expect(ERPNEXT_ENTITY_MAP.asset.fieldMap.date).toBe("purchase_date");
    expect(ERPNEXT_ENTITY_MAP.expense_claim.fieldMap.date).toBe("posting_date");
  });

  it("a pure master with no business date falls back to Frappe's `creation` timestamp", () => {
    expect(ERPNEXT_ENTITY_MAP.warehouse.fieldMap.date).toBe("creation");
    expect(ERPNEXT_ENTITY_MAP.account.fieldMap.date).toBe("creation");
    expect(ERPNEXT_ENTITY_MAP.customer.fieldMap.date).toBe("creation");
    expect(ERPNEXT_ENTITY_MAP.designation.fieldMap.date).toBe("creation");
  });

  it("nativeFields de-dupes when the date alias points at an already-mapped column", () => {
    const fields = nativeFields("expense_claim"); // date -> posting_date, and posting_date -> posting_date
    expect(fields.filter((f) => f === "posting_date")).toHaveLength(1);
  });

  it("a natural-language alias entityKey ('invoice') resolves to the real target's mapping", () => {
    expect(ERPNEXT_ENTITY_MAP.invoice).toBe(ERPNEXT_ENTITY_MAP.sales_invoice);
    expect(ERPNEXT_ENTITY_MAP.bill).toBe(ERPNEXT_ENTITY_MAP.purchase_invoice);
    expect(toNativeFilters("invoice", { status: "Overdue" })).toEqual({ status: "Overdue" });
    expect(nativeFields("invoice")).toEqual(nativeFields("sales_invoice"));
  });

  it("a real doctype never reverse-resolves to one of its aliases", () => {
    expect(entityKeyForDoctype("Sales Invoice")).toBe("sales_invoice");
    expect(entityKeyForDoctype("Customer")).toBe("customer");
  });

  it("filtering by canonical `date` now translates on every entity instead of throwing", () => {
    expect(toNativeFilters("work_order", { date: { op: "relative", value: "last_week" } })).toEqual({
      planned_start_date: { op: "relative", value: "last_week" },
    });
    expect(toNativeFilters("warehouse", { date: { op: "relative", value: "this_month" } })).toEqual({
      creation: { op: "relative", value: "this_month" },
    });
  });
});

describe("toNativeData", () => {
  it("translates canonical field names to native ones", () => {
    expect(toNativeData("quotation", { party: "Acme Corp", status: "Open" })).toEqual({
      party_name: "Acme Corp",
      status: "Open",
    });
  });

  it("drops a canonical field with no native mapping and warns, rather than passing it through", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const out = toNativeData("quotation", { party: "Acme Corp", made_up_field: "x" });
    expect(out).toEqual({ party_name: "Acme Corp" });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("made_up_field"));
    warnSpy.mockRestore();
  });

  it("translates a child-table array field's rows through the child fieldMap", () => {
    const out = toNativeData("quotation", {
      items: [{ item_code: "ITEM-1", qty: 2, rate: 100 }],
    });
    expect(out.items).toEqual([{ item_code: "ITEM-1", qty: 2, rate: 100 }]);
  });

  it("throws for an unknown entityKey", () => {
    expect(() => toNativeData("not_a_real_entity", {})).toThrow(/No ERPNext entity mapping/);
  });
});

// Confirmed live 2026-08-11: "how many new leads this month" filtered on
// {"created_date":{...}} (a plausible-but-wrong field name — the real
// one is "created"). toNativeData's silent drop-and-warn meant the date
// condition never reached ERPNext at all; the query fell back to an
// unfiltered default-sorted list with no error, and July-dated rows
// leaked into a "this month" answer. toNativeFilters exists specifically
// so a filter (as opposed to a create/update body field) fails loudly
// instead of silently vanishing.
describe("toNativeFilters", () => {
  it("translates canonical filter field names to native ones, same as toNativeData for the happy path", () => {
    expect(toNativeFilters("quotation", { party: "Acme Corp", status: "Open" })).toEqual({
      party_name: "Acme Corp",
      status: "Open",
    });
  });

  it("throws (does NOT silently drop) a filter field with no native mapping", () => {
    expect(() => toNativeFilters("lead", { created_date: { op: "relative", value: "this_month" } })).toThrow(
      /"created_date" is not a real filter field for "lead"/
    );
  });

  it("succeeds with the real field name for the exact live failing case", () => {
    expect(toNativeFilters("lead", { created: { op: "relative", value: "this_month" } })).toEqual({
      creation: { op: "relative", value: "this_month" },
    });
  });

  it("throws for an unknown entityKey", () => {
    expect(() => toNativeFilters("not_a_real_entity", {})).toThrow(/No ERPNext entity mapping/);
  });
});

describe("toCanonicalRow", () => {
  it("translates a native ERPNext row back to canonical field names", () => {
    const row = toCanonicalRow("quotation", { name: "QTN-001", party_name: "Acme Corp", status: "Open", grand_total: 5000 });
    expect(row).toMatchObject({ id: "QTN-001", party: "Acme Corp", status: "Open", total: 5000 });
  });

  it("round-trips a quotation's real line items back into canonical shape (the fix behind the quotation->sales-order conversion bug)", () => {
    const nativeRow = {
      name: "QTN-002",
      party_name: "Acme Corp",
      items: [{ item_code: "ITEM-1", qty: 4, uom: "Nos", rate: 250, warehouse: "Main Warehouse - SEMPL" }],
    };
    const row = toCanonicalRow("quotation", nativeRow);
    expect(row.items).toEqual([{ item_code: "ITEM-1", qty: 4, uom: "Nos", rate: 250, warehouse: "Main Warehouse - SEMPL" }]);
  });

  it("omits a child-table canonical key entirely when the native row has no such array (list() results)", () => {
    const row = toCanonicalRow("quotation", { name: "QTN-003", party_name: "Acme Corp" });
    expect(row.items).toBeUndefined();
  });

  // Added 2026-08-12 alongside supplier_quotation's own childTables
  // mapping — mirrors the quotation test above exactly: a real Purchase
  // Order should pull its items from the supplier's actual Supplier
  // Quotation via supplier_quotation.get, same fix class as the
  // quotation->sales-order conversion bug.
  it("round-trips a supplier quotation's real line items back into canonical shape", () => {
    const nativeRow = {
      name: "SQ-001",
      supplier: "Acme Supplies",
      items: [{ item_code: "RM-1000", qty: 150, uom: "Nos", rate: 420, warehouse: "Raw Material - SEMPL" }],
    };
    const row = toCanonicalRow("supplier_quotation", nativeRow);
    expect(row.items).toEqual([{ item_code: "RM-1000", qty: 150, uom: "Nos", rate: 420, warehouse: "Raw Material - SEMPL" }]);
  });

  it("throws for an unknown entityKey", () => {
    expect(() => toCanonicalRow("not_a_real_entity", {})).toThrow(/No ERPNext entity mapping/);
  });
});
