import { EntityUtils, resolveEntityKey, stripDottedPrefix, stripFieldQualifiers } from "../entityUtils";

describe("EntityUtils.resolveEntityKey", () => {
  it("resolves natural-language aliases to the real entityKey", () => {
    expect(resolveEntityKey("invoice")).toBe("sales_invoice");
    expect(resolveEntityKey("invoices")).toBe("sales_invoice");
    expect(resolveEntityKey("bill")).toBe("purchase_invoice");
    expect(resolveEntityKey("so")).toBe("sales_order");
    expect(resolveEntityKey("po")).toBe("purchase_order");
    expect(resolveEntityKey("quote")).toBe("quotation");
    expect(resolveEntityKey("vendors")).toBe("supplier");
    expect(resolveEntityKey("tickets")).toBe("issue");
  });

  it("is case-insensitive for aliases", () => {
    expect(resolveEntityKey("INVOICE")).toBe("sales_invoice");
    expect(resolveEntityKey("  Invoices  ")).toBe("sales_invoice");
  });

  it("returns a real entityKey unchanged — including ones outside the alias table", () => {
    expect(resolveEntityKey("sales_invoice")).toBe("sales_invoice");
    expect(resolveEntityKey("customer")).toBe("customer");
    // proves validity is DERIVED from ENTITY_CONFIGS, not a hand-kept list
    expect(resolveEntityKey("work_order")).toBe("work_order");
    expect(resolveEntityKey("journal_entry")).toBe("journal_entry");
    expect(resolveEntityKey("salary_slip")).toBe("salary_slip");
  });

  it("returns an unknown key unchanged so the caller's own error still fires", () => {
    expect(resolveEntityKey("not_a_real_entity")).toBe("not_a_real_entity");
    expect(resolveEntityKey("")).toBe("");
    expect(resolveEntityKey(null as any)).toBeNull();
    expect(resolveEntityKey(undefined as any)).toBeUndefined();
  });
});

describe("EntityUtils field-name normalization", () => {
  it("stripDottedPrefix removes a SQL-style table qualifier at any depth", () => {
    expect(stripDottedPrefix("sales_invoice.customer")).toBe("customer");
    expect(stripDottedPrefix("a.b.c")).toBe("c");
    expect(stripDottedPrefix("customer")).toBe("customer");
  });

  it("stripFieldQualifiers also drops a trailing _id (the groupBy / join-key habit)", () => {
    expect(stripFieldQualifiers("customer_id")).toBe("customer");
    expect(stripFieldQualifiers("party_id")).toBe("party");
    expect(stripFieldQualifiers("sales_invoice.customer_id")).toBe("customer");
  });

  it("stripFieldQualifiers leaves the bare identity field and non-_id names alone", () => {
    expect(stripFieldQualifiers("id")).toBe("id");
    expect(stripFieldQualifiers("customer.id")).toBe("id");
    expect(stripFieldQualifiers("grid")).toBe("grid"); // ends in "id", not "_id"
    expect(stripFieldQualifiers("status")).toBe("status");
  });

  it("does NOT run a field name through entity resolution — a field is not an entity", () => {
    // "product" is an ENTITY alias (-> item); as a FIELD name it must survive
    expect(stripFieldQualifiers("product")).toBe("product");
  });
});

describe("EntityUtils.isValidEntity / getEntityConfig / realEntityKeys", () => {
  it("isValidEntity accepts real keys and resolvable aliases, rejects junk", () => {
    expect(EntityUtils.isValidEntity("sales_invoice")).toBe(true);
    expect(EntityUtils.isValidEntity("invoice")).toBe(true);
    expect(EntityUtils.isValidEntity("work_order")).toBe(true);
    expect(EntityUtils.isValidEntity("nonsense")).toBe(false);
    expect(EntityUtils.isValidEntity("")).toBe(false);
  });

  it("getEntityConfig resolves an alias then returns the real config", () => {
    expect(EntityUtils.getEntityConfig("invoice")?.entityKey).toBe("sales_invoice");
    expect(EntityUtils.getEntityConfig("customer")?.entityKey).toBe("customer");
    expect(EntityUtils.getEntityConfig("nonsense")).toBeUndefined();
  });

  it("realEntityKeys is the full derived set (all modules), not a curated shortlist", () => {
    const keys = EntityUtils.realEntityKeys();
    expect(keys.size).toBeGreaterThan(50);
    expect(keys.has("purchase_order")).toBe(true);
    expect(keys.has("attendance")).toBe(true);
    expect(keys.has("invoice")).toBe(false); // aliases are NOT real keys
  });
});
