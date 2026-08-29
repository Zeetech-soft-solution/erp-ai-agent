import { Session, ToolDefinition } from "../types";

// gateway.ts is the SINGLE enforcement point for role-gating and
// business-rule checks — mock its three collaborators so these tests
// exercise gateway's own decision logic in isolation, not moduleRegistry's
// or businessRuleEngine's (those have their own responsibility and, in
// businessRuleEngine's case, their own simple internal state machine).
jest.mock("../moduleRegistry", () => ({
  moduleRegistry: { findTool: jest.fn(), getAllTools: jest.fn() },
}));
jest.mock("../businessRuleEngine", () => ({
  businessRuleEngine: { evaluate: jest.fn() },
}));
jest.mock("../ruleOutcomeLogger", () => ({
  ruleOutcomeLogger: { log: jest.fn().mockResolvedValue(undefined) },
}));

import { callTool, listAllowedTools, ToolNotAllowedError, RuleViolationError } from "../gateway";
import { moduleRegistry } from "../moduleRegistry";
import { businessRuleEngine } from "../businessRuleEngine";
import { ruleOutcomeLogger } from "../ruleOutcomeLogger";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sub: "anjali.singh67@sunriseelectronics.example.in",
    erpnext_roles: ["Purchase User"],
    allowed_tools: ["purchase_order.list"],
    credential: { mode: "api_key", apiKey: "k", apiSecret: "s" },
    ...overrides,
  };
}

function makeTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "purchase_order.list",
    description: "List purchase orders",
    module: "purchase_order",
    handler: jest.fn().mockResolvedValue({ rows: [] }),
    ...overrides,
  };
}

describe("callTool", () => {
  it("throws ToolNotAllowedError when the tool isn't in the session's allowed_tools — the exact bug class behind the Purchase-User false-denial investigation, from the other direction (verifying a REAL gap is still caught)", async () => {
    const session = makeSession({ allowed_tools: ["purchase_order.list"] });
    await expect(callTool(session, "sales_order.list", {})).rejects.toThrow(ToolNotAllowedError);
    expect(moduleRegistry.findTool).not.toHaveBeenCalled();
  });

  it("allows any tool when allowed_tools contains the '*' wildcard", async () => {
    const session = makeSession({ allowed_tools: ["*"] });
    const tool = makeTool({ name: "sales_order.list" });
    (moduleRegistry.findTool as jest.Mock).mockReturnValue(tool);
    const result = await callTool(session, "sales_order.list", {});
    expect(result).toEqual({ rows: [] });
  });

  it("throws a plain Error for a tool name that isn't allowed-listed but doesn't resolve to a real registered tool", async () => {
    const session = makeSession({ allowed_tools: ["*"] });
    (moduleRegistry.findTool as jest.Mock).mockReturnValue(undefined);
    await expect(callTool(session, "nonexistent.tool", {})).rejects.toThrow(/Unknown tool/);
  });

  it("calls the handler directly (skipping business-rule evaluation) when the tool has no entityKey/ruleAction", async () => {
    const session = makeSession();
    const tool = makeTool();
    (moduleRegistry.findTool as jest.Mock).mockReturnValue(tool);
    await callTool(session, "purchase_order.list", { foo: "bar" });
    expect(tool.handler).toHaveBeenCalledWith({ foo: "bar" }, session);
    expect(businessRuleEngine.evaluate).not.toHaveBeenCalled();
  });

  it("evaluates business rules for a create/update tool and proceeds when allowed", async () => {
    const session = makeSession({ allowed_tools: ["purchase_order.create"] });
    const tool = makeTool({ name: "purchase_order.create", entityKey: "purchase_order", ruleAction: "create" });
    (moduleRegistry.findTool as jest.Mock).mockReturnValue(tool);
    (businessRuleEngine.evaluate as jest.Mock).mockResolvedValue({ allowed: true, violations: [] });

    const result = await callTool(session, "purchase_order.create", { supplier: "Acme" });

    expect(businessRuleEngine.evaluate).toHaveBeenCalledWith("purchase_order", "create", { supplier: "Acme" }, session);
    expect(tool.handler).toHaveBeenCalled();
    expect(result).toEqual({ rows: [] });
  });

  it("logs the rule outcome (allowed and denied cases alike) for audit", async () => {
    const session = makeSession({ allowed_tools: ["purchase_order.create"] });
    const tool = makeTool({ name: "purchase_order.create", entityKey: "purchase_order", ruleAction: "create" });
    (moduleRegistry.findTool as jest.Mock).mockReturnValue(tool);
    (businessRuleEngine.evaluate as jest.Mock).mockResolvedValue({ allowed: true, violations: [] });

    await callTool(session, "purchase_order.create", {});

    expect(ruleOutcomeLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entity_key: "purchase_order", action: "create", actor_email: session.sub, allowed: true })
    );
  });

  it("throws RuleViolationError and never calls the handler when a business rule blocks the action", async () => {
    const session = makeSession({ allowed_tools: ["purchase_order.create"] });
    const tool = makeTool({ name: "purchase_order.create", entityKey: "purchase_order", ruleAction: "create" });
    (moduleRegistry.findTool as jest.Mock).mockReturnValue(tool);
    (businessRuleEngine.evaluate as jest.Mock).mockResolvedValue({
      allowed: false,
      violations: [{ message: "Supplier is blacklisted.", blocking: true }],
    });

    await expect(callTool(session, "purchase_order.create", {})).rejects.toThrow(RuleViolationError);
    await expect(callTool(session, "purchase_order.create", {})).rejects.toThrow(/Supplier is blacklisted/);
    expect(tool.handler).not.toHaveBeenCalled();
  });

  // Confirmed live 2026-08-11 (manual business-rule audit): a
  // non-blocking violation was evaluated and logged, then completely
  // discarded — the caller only ever got the handler's own return value,
  // with no path for the warning to reach the LLM/user at all. This made
  // every "flag a likely duplicate" rule in the codebase silently inert.
  it("attaches non-blocking violation messages to the result as _business_rule_notes", async () => {
    const session = makeSession({ allowed_tools: ["quotation.create"] });
    const tool = makeTool({
      name: "quotation.create",
      entityKey: "quotation",
      ruleAction: "create",
      handler: jest.fn().mockResolvedValue({ id: "SAL-QTN-2026-00099" }),
    });
    (moduleRegistry.findTool as jest.Mock).mockReturnValue(tool);
    (businessRuleEngine.evaluate as jest.Mock).mockResolvedValue({
      allowed: true,
      violations: [{ message: '"Acme Corp" already has an open quotation (SAL-QTN-2026-00050).', blocking: false }],
    });

    const result = await callTool(session, "quotation.create", { party: "Acme Corp" });

    expect(result).toEqual({
      id: "SAL-QTN-2026-00099",
      _business_rule_notes: ['"Acme Corp" already has an open quotation (SAL-QTN-2026-00050).'],
    });
  });

  it("does not attach _business_rule_notes when there are no violations at all", async () => {
    const session = makeSession({ allowed_tools: ["purchase_order.create"] });
    const tool = makeTool({ name: "purchase_order.create", entityKey: "purchase_order", ruleAction: "create" });
    (moduleRegistry.findTool as jest.Mock).mockReturnValue(tool);
    (businessRuleEngine.evaluate as jest.Mock).mockResolvedValue({ allowed: true, violations: [] });

    const result = await callTool(session, "purchase_order.create", {});

    expect(result).toEqual({ rows: [] });
    expect(result).not.toHaveProperty("_business_rule_notes");
  });

  it("never attaches _business_rule_notes to an array-shaped result (never pollutes a *.list table)", async () => {
    const session = makeSession({ allowed_tools: ["quotation.create"] });
    const tool = makeTool({
      name: "quotation.create",
      entityKey: "quotation",
      ruleAction: "create",
      handler: jest.fn().mockResolvedValue([{ id: "A" }, { id: "B" }]),
    });
    (moduleRegistry.findTool as jest.Mock).mockReturnValue(tool);
    (businessRuleEngine.evaluate as jest.Mock).mockResolvedValue({
      allowed: true,
      violations: [{ message: "some warning", blocking: false }],
    });

    const result = await callTool(session, "quotation.create", {});

    expect(result).toEqual([{ id: "A" }, { id: "B" }]);
  });
});

describe("listAllowedTools", () => {
  const allTools = [
    makeTool({ name: "purchase_order.list" }),
    makeTool({ name: "purchase_order.create" }),
    makeTool({ name: "sales_order.list" }),
  ];

  beforeEach(() => {
    (moduleRegistry.getAllTools as jest.Mock).mockReturnValue(allTools);
  });

  it("returns only the tools named in the session's allowed_tools", () => {
    const session = makeSession({ allowed_tools: ["purchase_order.list"] });
    expect(listAllowedTools(session).map((t) => t.name)).toEqual(["purchase_order.list"]);
  });

  it("returns every registered tool when allowed_tools is the '*' wildcard", () => {
    const session = makeSession({ allowed_tools: ["*"] });
    expect(listAllowedTools(session)).toEqual(allTools);
  });

  it("returns an empty list for a session with no matching allowed tools", () => {
    const session = makeSession({ allowed_tools: ["some_other_module.list"] });
    expect(listAllowedTools(session)).toEqual([]);
  });
});
