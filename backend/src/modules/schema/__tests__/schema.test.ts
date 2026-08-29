import { listTables, getTableSchema, entityLiveEnumFields, mergeLiveEnumValues } from "../index";

describe("listTables", () => {
  it("returns every real table name", () => {
    const result = listTables();
    expect(result.tables.length).toBeGreaterThan(10);
    expect(result.tables.some((t) => t.tableName === "sales_invoice")).toBe(true);
    expect(result.tables.some((t) => t.tableName === "customer")).toBe(true);
  });
});

describe("getTableSchema", () => {
  it("returns one real table's shape as a plain schema string", () => {
    const result = getTableSchema({ tableName: "sales_invoice" });
    expect(result.schema).toContain("TABLE sales_invoice");
    expect(result.schema).toContain("status");
    // Only one TABLE block — not several entities' shapes mixed in.
    expect(result.schema.match(/^TABLE /gm)?.length).toBe(1);
  });

  // Real, live-found bug (2026-08-23/24): the old "field -> entity.id"
  // notation read like a literal dotted field name — a real join call
  // used leftKey:"customer.id" instead of the real bare "customer",
  // silently matched zero rows, and produced a false "no records"
  // answer. Now spells out the exact bare leftKey/rightKey to use.
  it("surfaces real linkFields as an unambiguous join hint — the exact bare leftKey/rightKey, never a dotted field name", () => {
    const result = getTableSchema({ tableName: "sales_invoice" });
    expect(result.schema).toContain('customer (links to customer\'s own "id" — join leftKey:"customer" rightKey:"id")');
    expect(result.schema).not.toContain("customer -> customer.id");
  });

  it("surfaces real fieldValues (enum-like fields and their actual allowed values)", () => {
    const result = getTableSchema({ tableName: "sales_invoice" });
    expect(result.schema).toContain("status (");
    expect(result.schema).toContain("Paid");
    expect(result.schema).toContain("Overdue");
  });

  it("an unmatched tableName returns a real, honest note, not a thrown error", () => {
    const result = getTableSchema({ tableName: "not_a_real_table" });
    expect(result.schema).toMatch(/No table named/);
  });

  // Real, explicit product ask (2026-08-21): "let schema search add
  // search capability by name" — restores keyword discovery after
  // data_table.list was disabled the same session, folded into this
  // same tool via an optional "query" argument instead of tableName.
  it("query mode returns matching real table NAMES, not full schemas", () => {
    const result = getTableSchema({ query: "invoice" });
    expect(result.schema).toContain("sales_invoice");
    expect(result.schema).toContain("purchase_invoice");
    // A name-only listing, not a full field-by-field schema dump.
    expect(result.schema).not.toContain("TABLE sales_invoice (");
  });

  it("query mode with no real match returns a real, honest note", () => {
    const result = getTableSchema({ query: "not_a_real_keyword_xyz" });
    expect(result.schema).toMatch(/No real table matched/);
  });

  it("neither tableName nor query gives a clear, actionable prompt instead of a silent empty result", () => {
    const result = getTableSchema({});
    expect(result.schema).toMatch(/tableName.*query|query.*tableName/);
  });
});

// Real, live-found bug (2026-08-24, interaction_log 3134): "Unpaid" is a
// technically-valid ERPNext status but never actually occurs in this
// tenant's real data (only Paid/Overdue do) — the static ENUM list
// invited exactly that wrong guess. See these functions' own doc
// comments in ../index.ts for the full mechanism.
describe("entityLiveEnumFields", () => {
  it("names the one field configured with fieldValues for a real entity", () => {
    expect(entityLiveEnumFields("sales_invoice")).toEqual(["status"]);
  });

  it("names EVERY field for a real entity configuring more than one (issue: status AND priority)", () => {
    expect(entityLiveEnumFields("issue")).toEqual(["status", "priority"]);
  });

  it("returns an empty array for a real entity with no fieldValues configured at all", () => {
    expect(entityLiveEnumFields("customer")).toEqual([]);
  });

  it("returns an empty array for a table name that doesn't exist", () => {
    expect(entityLiveEnumFields("not_a_real_table")).toEqual([]);
  });
});

describe("mergeLiveEnumValues", () => {
  it("swaps the static ENUM(...) list for the field's real observed values", () => {
    const schema = getTableSchema({ tableName: "sales_invoice" }).schema;
    const merged = mergeLiveEnumValues(schema, "status", ["Paid", "Overdue"]);
    expect(merged).toContain("status (Paid, Overdue)");
    expect(merged).not.toContain("(Draft, Return"); // the old static list is gone, not just supplemented
  });

  it("leaves the schema untouched when there are no real live values yet", () => {
    const schema = getTableSchema({ tableName: "sales_invoice" }).schema;
    expect(mergeLiveEnumValues(schema, "status", [])).toBe(schema);
  });

  it("leaves the schema untouched when the named field has no ENUM in it at all", () => {
    const schema = getTableSchema({ tableName: "sales_invoice" }).schema;
    expect(mergeLiveEnumValues(schema, "total", ["100", "200"])).toBe(schema);
  });
});
