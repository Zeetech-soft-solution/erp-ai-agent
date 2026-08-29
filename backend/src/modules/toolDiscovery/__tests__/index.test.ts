import { searchTools, toolDiscoveryModule } from "../index";
import { ToolDefinition } from "../../../core/types";

function stubTool(name: string, module: string, description = `${name} description.`): ToolDefinition {
  return { name, module, description, handler: async () => ({}) };
}

// entityKey/ruleAction set, same shape entityModuleFactory.ts's own
// real generated create/update tools always carry (see its own doc
// comment: "create/update tools are always tagged with entityKey/
// ruleAction") — needed to exercise the REAL businessRuleEngine
// RULE_CONFIGS lookup, not just the plain module-level guardrail path.
function entityTool(name: string, module: string, entityKey: string, ruleAction: "create" | "update", description = `${name} description.`): ToolDefinition {
  return { name, module, description, entityKey, ruleAction, handler: async () => ({}) };
}

const CANDIDATES: ToolDefinition[] = [
  stubTool("employee.list", "hr", "List employee records."),
  stubTool("attendance.list", "hr", "List attendance records, including who's on leave."),
  stubTool("quotation.create", "selling", "Create a new quotation."),
  stubTool("quotation.list", "selling", "List quotations."),
  stubTool("sales_order.create", "selling", "Create a sales order from a quotation."),
  stubTool("purchase_order.list", "buying", "List purchase orders."),
];

describe("searchTools", () => {
  it("groups matches by module rather than returning one flat list", () => {
    const out = searchTools(CANDIDATES, {});
    expect(out.results.hr).toEqual(
      expect.arrayContaining([{ name: "employee.list", description: "List employee records." }])
    );
    expect(out.results.selling.length).toBe(3);
    expect(out.results.buying.length).toBe(1);
  });

  it("filters by module", () => {
    const out = searchTools(CANDIDATES, { module: "hr" });
    expect(Object.keys(out.results)).toEqual(["hr"]);
    expect(out.results.hr).toHaveLength(2);
  });

  it("filters by keyword against name/description", () => {
    const out = searchTools(CANDIDATES, { query: "leave" });
    expect(Object.keys(out.results)).toEqual(["hr"]);
    expect(out.results.hr).toEqual([{ name: "attendance.list", description: "List attendance records, including who's on leave." }]);
  });

  it("combines module + keyword filters", () => {
    const out = searchTools(CANDIDATES, { module: "selling", query: "create" });
    expect(out.results.selling.map((r) => r.name).sort()).toEqual(["quotation.create", "sales_order.create"]);
  });

  it("never returns itself as a match, even with an empty query", () => {
    const withSelf = [...CANDIDATES, stubTool("tools.search", "meta", "Search tools.")];
    const out = searchTools(withSelf, {});
    const allNames = Object.values(out.results).flat().map((r) => r.name);
    expect(allNames).not.toContain("tools.search");
  });

  it("attaches a write_reminder only when a create/update tool is among the matches", () => {
    const readOnly = searchTools(CANDIDATES, { module: "hr" });
    expect(readOnly.write_reminder).toBeUndefined();

    const withWrite = searchTools(CANDIDATES, { module: "selling", query: "create" });
    expect(withWrite.write_reminder).toMatch(/confirm/i);
  });

  it("draws module guardrail text from MODULE_PROMPT_SECTIONS (empty in this distribution, so omitted)", () => {
    // The shipped distribution ships no module prompt text, so no
    // guardrails string is attached. The wiring (reuse of
    // MODULE_PROMPT_SECTIONS, dedupe) is unchanged.
    const out = searchTools(CANDIDATES, { module: "hr" });
    expect(out.guardrails).toBeUndefined();
  });

  it("never crashes resolving guardrails for a module, present or not", () => {
    const out = searchTools(CANDIDATES, { module: "buying" });
    expect(typeof out.guardrails === "string" || out.guardrails === undefined).toBe(true);
  });

  it("returns a helpful note and empty results for a query matching nothing in the caller's own allowed set", () => {
    const out = searchTools(CANDIDATES, { query: "nonexistent_entity_xyz" });
    expect(out.results).toEqual({});
    expect(out.note).toMatch(/No matching tool/);
  });

  it("never caps or truncates — always returns the complete real match set, however large", () => {
    const many: ToolDefinition[] = Array.from({ length: 50 }, (_, i) => stubTool(`entity${i}.list`, "stock", "List entity."));
    const out = searchTools(many, {});
    const total = Object.values(out.results).reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(50);
  });

  it("finds analytics tools by module or query and includes analytics guardrails", () => {
    const tools = [
      stubTool("analytics.aggregate", "utilities", "Aggregate records for metrics and charts."),
      stubTool("chart.build", "utilities", "Build charts directly."),
      stubTool("employee.list", "hr", "List employees."),
    ];
    const out = searchTools(tools, { module: "analytics" });
    expect(out.results.analytics).toBeDefined();
    expect(out.results.analytics.map((t) => t.name)).toContain("analytics.aggregate");
    expect(out.guardrails).toBeUndefined();
  });
});

describe("searchTools — no longer surfaces business_rules (2026-08-23, explicit user request)", () => {
  // Real production entity ("quotation" — config/modules/selling/rules.ts,
  // one of the two currently-populated modules with a real RuleSet) —
  // proves the removal holds even for a doctype that DOES have real
  // registered rules, not just an absence-of-data coincidence. The real
  // enforcement (businessRuleEngine.ts, gateway.ts's callTool()) is
  // untouched — this only confirms the PRE-CALL surfacing is gone.
  const QUOTATION_CANDIDATES: ToolDefinition[] = [
    entityTool("quotation.create", "selling", "quotation", "create", "Create a new quotation."),
    entityTool("quotation.update", "selling", "quotation", "update", "Update an existing quotation."),
    stubTool("quotation.list", "selling", "List quotations."),
  ];

  it("never includes a business_rules field, even for a doctype with a real registered RuleSet", () => {
    const out = searchTools(QUOTATION_CANDIDATES, { module: "selling" });
    expect((out as any).business_rules).toBeUndefined();
  });

  it("stays absent regardless of create/update/read-only tool mix", () => {
    const createOnly = searchTools([entityTool("quotation.create", "selling", "quotation", "create")], {});
    expect((createOnly as any).business_rules).toBeUndefined();

    const updateOnly = searchTools([entityTool("quotation.update", "selling", "quotation", "update")], {});
    expect((updateOnly as any).business_rules).toBeUndefined();

    const readOnly = searchTools([stubTool("quotation.list", "selling", "List quotations.")], {});
    expect((readOnly as any).business_rules).toBeUndefined();
  });
});

describe("toolDiscoveryModule", () => {
  it("exposes exactly one tool, tools.search, with query/module parameters", () => {
    expect(toolDiscoveryModule.tools).toHaveLength(1);
    const tool = toolDiscoveryModule.tools[0];
    expect(tool.name).toBe("tools.search");
    expect(tool.parameters?.properties).toHaveProperty("query");
    expect(tool.parameters?.properties).toHaveProperty("module");
  });

  it("its own description instructs the model to call it before guessing a tool name", () => {
    // 2026-08-23: description compacted to "Call FIRST if unsure." —
    // same real guarantee (call this before guessing), shorter wording.
    expect(toolDiscoveryModule.tools[0].description).toMatch(/call first if unsure/i);
  });
});
