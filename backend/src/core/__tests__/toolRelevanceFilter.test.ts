import { narrowToolsForPrompt, detectModules, selectToolsForTurn, selectRelayTools } from "../toolRelevanceFilter";
import { ToolDefinition } from "../types";

// Confirmed live 2026-08-11: a System-Manager-level ("*") session's full
// 226-tool list broke EVERY LLM call outright — "Invalid 'tools': array
// too long. Expected an array with maximum length 128, but got an array
// with length 226 instead." This suite locks in the fix.
function makeTool(name: string, module: string): ToolDefinition {
  return { name, description: "", module, handler: async () => ({}) };
}

function makeTools(count: number, module: string, prefix = "t"): ToolDefinition[] {
  return Array.from({ length: count }, (_, i) => makeTool(`${prefix}${i}.list`, module));
}

describe("narrowToolsForPrompt", () => {
  it("is a no-op when the tool list is at or below the safe cap", () => {
    const tools = makeTools(50, "hr");
    expect(narrowToolsForPrompt(tools, "who is absent today")).toBe(tools);
  });

  it("is a no-op right at the boundary (120 tools)", () => {
    const tools = makeTools(120, "hr");
    expect(narrowToolsForPrompt(tools, "anything")).toHaveLength(120);
  });

  it("narrows an over-cap list to the module matched by the prompt, plus always-included utility modules", () => {
    const tools = [
      ...makeTools(60, "hr", "hr"),
      ...makeTools(60, "accounting", "acc"),
      ...makeTools(20, "utilities", "an"),
      ...makeTools(10, "context", "ctx"),
      ...makeTools(10, "document", "doc"),
    ];
    expect(tools.length).toBeGreaterThan(120);
    const result = narrowToolsForPrompt(tools, "who was absent this week?");
    const modules = new Set(result.map((t) => t.module));
    expect(modules.has("hr")).toBe(true);
    expect(modules.has("accounting")).toBe(false);
    expect(modules.has("utilities")).toBe(true);
    expect(modules.has("context")).toBe(true);
    expect(modules.has("document")).toBe(true);
  });

  it("matches multiple modules when the prompt spans more than one topic", () => {
    const tools = [
      ...makeTools(50, "hr", "hr"),
      ...makeTools(50, "accounting", "acc"),
      ...makeTools(30, "selling", "sel"),
    ];
    const result = narrowToolsForPrompt(tools, "compare payroll cost to sales invoice revenue this month");
    const modules = new Set(result.map((t) => t.module));
    expect(modules.has("hr")).toBe(true);
    expect(modules.has("accounting")).toBe(true);
  });

  // 2026-08-23: FALLBACK_MODULES (crm/selling/accounting on a genuinely
  // vague question) was removed entirely — see the real doc comment at
  // detectModules' own definition. A vague question now narrows down to
  // just the always-include modules (context/document/meta/utilities),
  // relying on tools.search (owned by "meta") for real discovery rather
  // than guessing three arbitrary domains might contain the answer.
  it("a vague question with no matching keyword narrows to ONLY the always-include modules, not a guessed domain", () => {
    const tools = [
      ...makeTools(50, "crm", "crm"),
      ...makeTools(50, "selling", "sel"),
      ...makeTools(50, "manufacturing", "mfg"),
      ...makeTools(5, "meta", "meta"),
    ];
    const result = narrowToolsForPrompt(tools, "what's our company name");
    const modules = new Set(result.map((t) => t.module));
    expect(modules.has("crm")).toBe(false);
    expect(modules.has("selling")).toBe(false);
    expect(modules.has("manufacturing")).toBe(false);
    expect(modules.has("meta")).toBe(true);
  });

  it("never returns more than the safe cap even if several matched modules combine over it", () => {
    const tools = [
      ...makeTools(80, "hr", "hr"),
      ...makeTools(80, "accounting", "acc"),
    ];
    const result = narrowToolsForPrompt(tools, "compare payroll to accounts this month");
    expect(result.length).toBeLessThanOrEqual(120);
  });
});

describe("selectRelayTools — dumb: spine + keyword-matched module entities, everything else discovery-only", () => {
  const spine = [
    { name: "tools.search", description: "", module: "meta", handler: async () => ({}) },
    { name: "data_table.search_schema", description: "", module: "utilities", handler: async () => ({}) },
    { name: "data_table.list", description: "", module: "utilities", handler: async () => ({}) },
    { name: "database_engine.execute_query", description: "", module: "utilities", handler: async () => ({}) },
  ] as ToolDefinition[];
  const catalog: ToolDefinition[] = [
    ...spine,
    ...makeTools(6, "selling", "sel"),
    ...makeTools(8, "accounting", "acc"),
    ...makeTools(5, "crm", "crm"),
    ...makeTools(4, "hr", "hr"),
    { name: "analytics.aggregate", description: "", module: "utilities", handler: async () => ({}) },
    { name: "chart.build", description: "", module: "utilities", handler: async () => ({}) },
    { name: "report.generate", description: "", module: "report_generate", handler: async () => ({}) },
    { name: "email.send", description: "", module: "email", handler: async () => ({}) },
  ];

  it("keyword match → spine + that module's entities, nothing else", () => {
    const names = new Set(selectRelayTools(catalog, "show me open quotations").map((t) => t.name));
    expect(names.has("tools.search")).toBe(true);
    expect(names.has("data_table.search_schema")).toBe(true);
    expect(names.has("database_engine.execute_query")).toBe(true);
    expect(names.has("sel0.list")).toBe(true);
    expect(names.has("acc0.list")).toBe(false);
    expect(names.has("analytics.aggregate")).toBe(false); // discovery-only
    expect(names.has("chart.build")).toBe(false);
    expect(names.has("report.generate")).toBe(false);
    expect(names.has("email.send")).toBe(false);
  });

  it("multi-module question → all matched modules' entities + spine", () => {
    const names = new Set(selectRelayTools(catalog, "compare quotations to overdue invoices for customers").map((t) => t.name));
    expect(names.has("sel0.list")).toBe(true); // selling ("quotations")
    expect(names.has("acc0.list")).toBe(true); // accounting ("invoices"/"overdue")
    expect(names.has("crm0.list")).toBe(true); // crm ("customers")
    expect(names.has("analytics.aggregate")).toBe(false);
  });

  it("no keyword match → spine only", () => {
    const names = selectRelayTools(catalog, "hello there").map((t) => t.name);
    expect(names.sort()).toEqual(["data_table.list", "data_table.search_schema", "database_engine.execute_query", "tools.search"].sort());
  });

  it("analytics/chart keyword does NOT pull in analytics tools (discovery-only now)", () => {
    const names = new Set(selectRelayTools(catalog, "show me a sales chart with a trend line").map((t) => t.name));
    expect(names.has("analytics.aggregate")).toBe(false);
    expect(names.has("chart.build")).toBe(false);
    expect(names.has("sel0.list")).toBe(true); // "sales" still matches selling
    expect(names.has("tools.search")).toBe(true); // model discovers analytics from here
  });
});

describe("selectToolsForTurn", () => {
  it("keeps analytics tools and discovery while excluding unrelated domains", () => {
    const tools = [
      ...makeTools(12, "selling", "selling"),
      ...makeTools(12, "support", "support"),
      { name: "analytics.aggregate", description: "Aggregate analytics", module: "utilities", handler: async () => ({}) },
      { name: "email.send", description: "Send an email", module: "email", handler: async () => ({}) },
      { name: "tools.search", description: "Search tools", module: "meta", handler: async () => ({}) },
    ];
    const result = selectToolsForTurn(tools, "show a sales trend chart");
    const names = new Set(result.map((tool) => tool.name));
    expect(names.has("analytics.aggregate")).toBe(true);
    expect(names.has("tools.search")).toBe(true);
    expect(names.has("email.send")).toBe(false);
    expect(names.has("support0.list")).toBe(false);
  });

  it("fails open for ambiguous requests", () => {
    const tools = makeTools(30, "selling", "selling");
    expect(selectToolsForTurn(tools, "what should I look at today")).toBe(tools);
    expect(selectToolsForTurn(tools, "hi")).toBe(tools);
  });

  it("handles module aliases like tickets, project_issue, and payment_entry_actions", () => {
    const tools = [
      ...makeTools(10, "selling", "selling"),
      { name: "tickets.create", description: "Create ticket", module: "tickets", handler: async () => ({}) },
      { name: "project_issue.list", description: "List project issues", module: "project_issue", handler: async () => ({}) },
      { name: "payment_entry.create", description: "Create payment", module: "payment_entry_actions", handler: async () => ({}) },
      { name: "lead_qualification.qualify", description: "Qualify lead", module: "lead_qualification", handler: async () => ({}) },
      { name: "tools.search", description: "Search tools", module: "meta", handler: async () => ({}) },
    ];
    expect(selectToolsForTurn(tools, "open a support ticket for this issue").map((t) => t.name)).toContain("tickets.create");
    expect(selectToolsForTurn(tools, "track tasks for our project").map((t) => t.name)).toContain("project_issue.list");
    expect(selectToolsForTurn(tools, "record a payment for this invoice").map((t) => t.name)).toContain("payment_entry.create");
    expect(selectToolsForTurn(tools, "qualify this lead").map((t) => t.name)).toContain("lead_qualification.qualify");
  });

  it("selects document and notification tools when requested", () => {
    const tools = [
      ...makeTools(15, "selling", "selling"),
      { name: "document.get_pdf", description: "Get PDF", module: "document", handler: async () => ({}) },
      { name: "notification_log.mark_read", description: "Mark notification read", module: "utilities", handler: async () => ({}) },
      { name: "tools.search", description: "Search tools", module: "meta", handler: async () => ({}) },
    ];
    const docResult = selectToolsForTurn(tools, "download quotation as pdf");
    expect(docResult.map((t) => t.name)).toContain("document.get_pdf");

    const notifResult = selectToolsForTurn(tools, "mark notification as read");
    expect(notifResult.map((t) => t.name)).toContain("notification_log.mark_read");
  });
});

// Real, live-found bug 2026-08-20 (a 304-prompt regression sweep, one
// entity/module per real doctype): "item "/"sale " both had a TRAILING
// space (to avoid matching inside "wholesale"/"resale"), and " hr " was
// padded on BOTH sides — but a literal substring check can never match
// a PLURAL with no space after the stem ("items" has no space between
// "item" and "s") or a keyword genuinely at the very start/end of the
// prompt (a sentence ending in "...in hr" has no real space AFTER
// "hr"). Confirmed 100% reproducible live: "show me the items" fell
// through to FALLBACK_MODULES (crm/selling/accounting — NOT stock),
// and with no real item.list tool in view the model actually called
// quotation.list instead. "who works in hr" had the exact same gap for
// hr. See toolRelevanceFilter.ts's own doc comments for the full fix.
describe("detectModules — keyword matching handles plurals and sentence boundaries", () => {
  it("a plural with no trailing space still matches (the confirmed live 'items' bug)", () => {
    expect(detectModules("show me the items")).toContain("stock");
  });

  it("a keyword right at the very end of the prompt still matches (the confirmed live 'hr' bug)", () => {
    expect(detectModules("who works in hr")).toContain("hr");
  });

  it("a keyword right at the very start of the prompt still matches", () => {
    expect(detectModules("hr is asking about this")).toContain("hr");
  });

  it("the plural of a space-guarded keyword (sale -> sales) also matches", () => {
    expect(detectModules("show me sales")).toContain("selling");
  });

  it("mid-sentence occurrences (already working before this fix) still work", () => {
    expect(detectModules("what's the item price for this")).toContain("stock");
    expect(detectModules("hr department needs this")).toContain("hr");
  });
});

// 2026-08-23, real live gap found, then widened per explicit user
// direction ("not just greeting its when nothing is matching key word
// and no idea"): detectModules used to unconditionally add
// FALLBACK_MODULES (crm+selling+accounting, ~65 tools once
// role-filtered) whenever NO real keyword matched anything — a bare
// "hi" AND a genuinely ambiguous business question alike. That crosses
// TWO_PHASE_TOOL_THRESHOLD (relayReasoningEngine.ts) and triggers a
// whole extra real LLM round trip just to narrow 65 candidates back
// down. Removed entirely — TOOL_DISCOVERY's own "Unsure → tools.search"
// line is the real, already-documented answer for this case, and
// "meta" (which owns tools.search) is always in ALWAYS_INCLUDE_MODULES
// regardless, so a genuinely unmatched prompt always has a real, cheap
// way to discover the right tool instead of guessing three arbitrary
// domains might contain it.
describe("detectModules — no keyword match means no fallback dump, not just for greetings", () => {
  it("a bare greeting gets ONLY the always-include modules", () => {
    for (const greeting of ["hi", "Hi!", "hello", "hey", "thanks", "thank you", "ok", "bye"]) {
      const modules = detectModules(greeting);
      expect(modules.has("crm")).toBe(false);
      expect(modules.has("selling")).toBe(false);
      expect(modules.has("accounting")).toBe(false);
      expect(modules.has("utilities")).toBe(true); // always-include set is unaffected
    }
  });

  it("a genuinely ambiguous non-greeting question ALSO gets no fallback dump now — relies on tools.search instead", () => {
    const modules = detectModules("what should I look at today");
    expect(modules.has("crm")).toBe(false);
    expect(modules.has("selling")).toBe(false);
    expect(modules.has("accounting")).toBe(false);
    expect(modules.has("utilities")).toBe(true);
  });

  it("a real keyword match is completely unaffected — this only ever touched the zero-match case", () => {
    const modules = detectModules("hi, show me total sales this month");
    expect(modules.has("selling")).toBe(true);
  });
});
