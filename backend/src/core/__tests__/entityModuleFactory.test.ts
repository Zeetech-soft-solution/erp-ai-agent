import { buildEntityModule, normalizeListArgs } from "../entityModuleFactory";
import { EntityConfig } from "../types";

// Confirmed live 2026-08-10: "how many leave days does Ravi Kumar have
// left" filtered leave_allocation.list on {employee:"Ravi Kumar"} (the
// display name) instead of the real Employee id ("HR-EMP-00031") —
// a silent zero-row match reported back as "no records" (false). This
// suite locks in the fix: linkFields must be surfaced in the generated
// list tool's filter description, the same way fieldValues already is,
// so the LLM is told to resolve a name to an id first instead of
// guessing.
describe("buildEntityModule — filter description generation", () => {
  const baseConfig: EntityConfig = {
    entityKey: "leave_allocation",
    module: "hr",
    toolPrefix: "leave_allocation",
    canonicalFields: ["id", "employee", "leave_type", "from_date", "to_date"],
  };

  // 2026-08-23, explicit user request: field-level guidance moved from
  // one big prose blob (filters.description) to real structured JSON
  // schema — filters.properties.<field>.enum for real values,
  // .description for a link field's short resolve-first note. The
  // real DATA is still there (checked below at its new location); the
  // "COMBINED states" conceptual-overlap guidance (2026-08-11 bug fix:
  // "still awaiting receipt" missing "To Receive and Bill") is
  // genuinely gone, not relocated — a plain enum lists real values but
  // not which of them conceptually overlap. Deliberate tradeoff, not
  // an oversight.
  function listToolFilterProperties(config: EntityConfig): Record<string, any> {
    const mod = buildEntityModule(config);
    const listTool = mod.tools.find((t) => t.name === `${config.toolPrefix}.list`);
    expect(listTool).toBeDefined();
    const parameters = listTool!.parameters as any;
    return parameters.properties.filters.properties;
  }

  it("says nothing about a field that isn't a real linkField", () => {
    const properties = listToolFilterProperties(baseConfig);
    expect(properties.employee.description).toBeUndefined();
  });

  it("surfaces a linkFields entry as a real, short resolve-first note", () => {
    const properties = listToolFilterProperties({ ...baseConfig, linkFields: { employee: "employee" } });
    expect(properties.employee.description).toBe("real employee.id");
  });

  it("surfaces multiple linkFields entries, each naming its own target entity", () => {
    const properties = listToolFilterProperties({
      ...baseConfig,
      canonicalFields: ["id", "workstation", "from_warehouse", "to_warehouse"],
      linkFields: { from_warehouse: "warehouse", to_warehouse: "warehouse" },
    });
    expect(properties.from_warehouse.description).toBe("real warehouse.id");
    expect(properties.to_warehouse.description).toBe("real warehouse.id");
  });

  it("surfaces fieldValues as a real JSON enum, alongside linkFields on a different field", () => {
    const properties = listToolFilterProperties({
      ...baseConfig,
      canonicalFields: [...baseConfig.canonicalFields, "status"],
      fieldValues: { status: ["Open", "Closed"] },
      linkFields: { employee: "employee" },
    });
    expect(properties.status.enum).toEqual(["Open", "Closed"]);
    expect(properties.employee.description).toBe("real employee.id");
  });
});

// Confirmed live 2026-08-12: quotation.update({fields:{status:"Converted"}})
// hit a real Frappe validation error — Quotation's real status vocabulary
// (Draft/Open/Replied/Partially Ordered/Ordered/Lost/Cancelled/Expired) has
// no "Converted" (that's Lead/Opportunity's word for the same idea). Root
// cause: the update tool's "fields" property had no description at all,
// unlike "list"'s filters above which already surfaces fieldValues.
describe("buildEntityModule — update tool field description generation", () => {
  const baseConfig: EntityConfig = {
    entityKey: "quotation",
    module: "selling",
    toolPrefix: "quotation",
    canonicalFields: ["id", "status"],
  };

  // 2026-08-23, explicit user request: same relocation as the list
  // tool's filters above — real enum values now live on
  // fields.properties.<field>.enum (structured), not a prose sentence.
  function updateFieldProperties(config: EntityConfig): Record<string, any> {
    const mod = buildEntityModule(config);
    const updateTool = mod.tools.find((t) => t.name === `${config.toolPrefix}.update`);
    expect(updateTool).toBeDefined();
    const parameters = updateTool!.parameters as any;
    return parameters.properties.fields.properties;
  }

  it("surfaces real fieldValues on the update tool, same as the list tool already does", () => {
    const properties = updateFieldProperties({
      ...baseConfig,
      fieldValues: { status: ["Draft", "Open", "Replied", "Partially Ordered", "Ordered", "Lost", "Cancelled", "Expired"] },
    });
    expect(properties.status.enum).toEqual(["Draft", "Open", "Replied", "Partially Ordered", "Ordered", "Lost", "Cancelled", "Expired"]);
    // The exact live bug: "Converted" is not a real Quotation status.
    expect(properties.status.enum).not.toContain("Converted");
  });

  it("leaves the field with no enum when no fieldValues are configured, rather than a fabricated one", () => {
    const properties = updateFieldProperties(baseConfig);
    expect(properties.status.enum).toBeUndefined();
  });
});

// Confirmed live 2026-08-12: sales_order.create fabricated a "warehouse"
// value three retries in a row ("Main Warehouse", "FG Warehouse", "Rest Of
// The World") — none real (this deployment's real ones are e.g. "Stores -
// SEMPL"). itemFields is a flat string list with no per-field link
// metadata, so "warehouse" got zero guidance even though a warehouse.list
// tool already exists.
describe("buildEntityModule — line item warehouse guidance", () => {
  const baseConfig: EntityConfig = {
    entityKey: "sales_order",
    module: "selling",
    toolPrefix: "sales_order",
    canonicalFields: ["id", "customer"],
    lineItems: { canonicalField: "items", itemFields: ["item_code", "qty", "uom", "rate", "warehouse"] },
  };

  function createItemsDescription(config: EntityConfig): string {
    const mod = buildEntityModule(config);
    const createTool = mod.tools.find((t) => t.name === `${config.toolPrefix}.create`);
    expect(createTool).toBeDefined();
    const parameters = createTool!.parameters as any;
    return parameters.properties.items.description as string;
  }

  // 2026-08-23, explicit user request: shortened from the original essay
  // (which named the exact fabricated guesses) to a short warning — the
  // substance (real warehouse.list id, never a guessed name) is kept.
  it("warns never to guess a warehouse name and points at warehouse.list", () => {
    const description = createItemsDescription(baseConfig);
    expect(description).toContain("real warehouse.list id");
    expect(description).toMatch(/never a guessed name/i);
  });

  it("says nothing about warehouses when the entity's line items don't have one", () => {
    const description = createItemsDescription({
      ...baseConfig,
      lineItems: { canonicalField: "items", itemFields: ["item_code", "qty", "rate"] },
    });
    expect(description).not.toMatch(/warehouse/i);
  });

  it("does not override an entity-supplied custom lineItems description", () => {
    const description = createItemsDescription({
      ...baseConfig,
      lineItems: { canonicalField: "items", itemFields: ["item_code", "warehouse"], description: "Custom description." },
    });
    expect(description).toBe("Custom description.");
  });
});

// Confirmed live 2026-08-11: "overdue tasks" sent {"status":"Overdue"} as
// a TOP-LEVEL argument instead of nested under "filters" - the tool's own
// schema has no top-level "status" property, so it was silently ignored,
// returning an unfiltered page the model then mislabeled as "overdue" in
// its own prose (the real rows were "Completed").
describe("normalizeListArgs", () => {
  const canonicalFields = ["id", "project", "subject", "status", "priority"];

  it("folds a stray top-level arg matching a real canonical field into filters", () => {
    expect(normalizeListArgs({ status: "Overdue" }, canonicalFields)).toEqual({
      filters: { status: "Overdue" },
      limit: undefined,
      offset: undefined,
      sortBy: undefined,
      sortDir: undefined,
    });
  });

  it("leaves a properly-shaped call completely unchanged", () => {
    const result = normalizeListArgs({ filters: { status: "Open" }, limit: 10 }, canonicalFields);
    expect(result.filters).toEqual({ status: "Open" });
    expect(result.limit).toBe(10);
  });

  it("merges stray top-level fields alongside a real filters object, filters winning on collision", () => {
    const result = normalizeListArgs({ status: "Overdue", priority: "High", filters: { status: "Open" } }, canonicalFields);
    expect(result.filters).toEqual({ status: "Open", priority: "High" });
  });

  it("ignores a stray top-level key that isn't a real canonical field (e.g. a genuine unknown/typo)", () => {
    const result = normalizeListArgs({ made_up_thing: "x" }, canonicalFields);
    expect(result.filters).toBeUndefined();
  });

  it("handles missing args gracefully", () => {
    expect(normalizeListArgs(undefined, canonicalFields)).toEqual({
      filters: undefined,
      limit: undefined,
      offset: undefined,
      sortBy: undefined,
      sortDir: undefined,
    });
  });
});

// Real, explicit product ask 2026-08-19: never let a bare, unfiltered
// .list against an entity like communication (a person's own email
// inbox) dump everything into context just because the model forgot or
// didn't bother to narrow it.
describe("buildEntityModule — requireFilters gate", () => {
  const gatedConfig: EntityConfig = {
    entityKey: "communication",
    module: "utilities",
    toolPrefix: "communication",
    canonicalFields: ["id", "subject", "sender", "status"],
    requireFilters: true,
  };
  const session = { sub: "user@x.com", erpnext_roles: [], allowed_tools: [], credential: {} } as any;

  it("returns empty WITHOUT ever reaching the real connector when called with no filter at all", async () => {
    const { systemConnector } = require("../../config/system.config");
    const spy = jest.spyOn(systemConnector, "list").mockResolvedValue([{ id: "should-never-be-seen" }]);
    const mod = buildEntityModule(gatedConfig);
    const listTool = mod.tools.find((t) => t.name === "communication.list")!;
    const result = await listTool.handler({}, session);
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("calls through normally once a real filter is present", async () => {
    const { systemConnector } = require("../../config/system.config");
    const listSpy = jest.spyOn(systemConnector, "list").mockResolvedValue([{ id: "COMM-1", subject: "Invoice" }]);
    const countSpy = jest.spyOn(systemConnector, "count").mockResolvedValue(1);
    const mod = buildEntityModule(gatedConfig);
    const listTool = mod.tools.find((t) => t.name === "communication.list")!;
    const result = await listTool.handler({ filters: { subject: { op: "like", value: "%invoice%" } } }, session);
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(Array.from(result)).toEqual([{ id: "COMM-1", subject: "Invoice" }]);
    expect((result as any).totalCount).toBe(1);
    listSpy.mockRestore();
    countSpy.mockRestore();
  });

  it("a stray top-level filter (not nested under 'filters') still counts as a real filter, not blocked", async () => {
    const { systemConnector } = require("../../config/system.config");
    const listSpy = jest.spyOn(systemConnector, "list").mockResolvedValue([]);
    const countSpy = jest.spyOn(systemConnector, "count").mockResolvedValue(0);
    const mod = buildEntityModule(gatedConfig);
    const listTool = mod.tools.find((t) => t.name === "communication.list")!;
    await listTool.handler({ status: "Open" }, session);
    expect(listSpy).toHaveBeenCalledTimes(1);
    listSpy.mockRestore();
    countSpy.mockRestore();
  });

  it("an entity WITHOUT requireFilters set is completely unaffected — a bare call still runs normally", async () => {
    const { systemConnector } = require("../../config/system.config");
    const listSpy = jest.spyOn(systemConnector, "list").mockResolvedValue([{ id: "X" }]);
    const countSpy = jest.spyOn(systemConnector, "count").mockResolvedValue(1);
    const ungatedConfig: EntityConfig = { ...gatedConfig, requireFilters: false };
    const mod = buildEntityModule(ungatedConfig);
    const listTool = mod.tools.find((t) => t.name === "communication.list")!;
    const result = await listTool.handler({}, session);
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(Array.from(result)).toEqual([{ id: "X" }]);
    listSpy.mockRestore();
    countSpy.mockRestore();
  });
});

// 2026-08-23, explicit user request: "in query execution of 20 rows u
// already know how many rows ... what makes to ask llm" — a real,
// cheap systemConnector.count() now runs alongside every list() call,
// attached as a non-index rows.totalCount property (the return value
// stays a genuine array — Array.isArray/render/every existing caller
// unaffected). stripGroupsForContext (reasoningEngine.ts) reads it off
// to report the real exact total instead of a hasMore-only guess.
describe("buildEntityModule — real totalCount alongside list()", () => {
  const session = { sub: "user@x.com", erpnext_roles: [], allowed_tools: [], credential: {} } as any;
  const config: EntityConfig = {
    entityKey: "quotation",
    module: "selling",
    toolPrefix: "quotation",
    canonicalFields: ["id", "party", "status"],
  };

  it("runs count() alongside list(), with the SAME filters, and attaches the real total without changing the array shape", async () => {
    const { systemConnector } = require("../../config/system.config");
    const listSpy = jest.spyOn(systemConnector, "list").mockResolvedValue([{ id: "QTN-1" }, { id: "QTN-2" }]);
    const countSpy = jest.spyOn(systemConnector, "count").mockResolvedValue(37);
    const mod = buildEntityModule(config);
    const listTool = mod.tools.find((t) => t.name === "quotation.list")!;
    const result: any = await listTool.handler({ filters: { status: "Open" } }, session);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result.totalCount).toBe(37);
    expect(countSpy).toHaveBeenCalledWith("quotation", session.credential, { status: "Open" });
    listSpy.mockRestore();
    countSpy.mockRestore();
  });
});

// 2026-08-23, explicit user request: real ERPNext document submission
// (Draft -> Submitted). Opt-in only via operations — an entity that
// doesn't list "submit" gets no <prefix>.submit tool at all, same as
// "create"/"update" already work.
describe("buildEntityModule — submit operation", () => {
  const session = { sub: "user@x.com", erpnext_roles: [], allowed_tools: [], credential: {} } as any;
  const submittableConfig: EntityConfig = {
    entityKey: "purchase_order",
    module: "buying",
    toolPrefix: "purchase_order",
    canonicalFields: ["id", "supplier", "status"],
    operations: ["list", "get", "submit"],
  };

  it("generates a real purchase_order.submit tool, tagged for real businessRuleEngine enforcement", () => {
    const mod = buildEntityModule(submittableConfig);
    const submitTool = mod.tools.find((t) => t.name === "purchase_order.submit");
    expect(submitTool).toBeDefined();
    expect((submitTool as any).entityKey).toBe("purchase_order");
    expect((submitTool as any).ruleAction).toBe("update");
    expect((submitTool!.parameters as any).required).toEqual(["id"]);
  });

  it("an entity that doesn't list \"submit\" in operations gets no submit tool at all", () => {
    const mod = buildEntityModule({ ...submittableConfig, operations: ["list", "get"] });
    expect(mod.tools.find((t) => t.name === "purchase_order.submit")).toBeUndefined();
  });

  it("submit tool's handler calls systemConnector.submit with the real entityKey/credential/id", async () => {
    const { systemConnector } = require("../../config/system.config");
    const spy = jest.spyOn(systemConnector, "submit").mockResolvedValue({ id: "PUR-ORD-2026-00001", status: "To Receive and Bill" });
    const mod = buildEntityModule(submittableConfig);
    const submitTool = mod.tools.find((t) => t.name === "purchase_order.submit")!;
    const result = await submitTool.handler({ id: "PUR-ORD-2026-00001" }, session);
    expect(spy).toHaveBeenCalledWith("purchase_order", session.credential, "PUR-ORD-2026-00001");
    expect(result).toEqual({ id: "PUR-ORD-2026-00001", status: "To Receive and Bill" });
    spy.mockRestore();
  });
});
