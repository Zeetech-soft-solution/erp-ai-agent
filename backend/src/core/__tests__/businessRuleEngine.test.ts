import { businessRuleEngine } from "../businessRuleEngine";
import { BusinessRule, Session } from "../types";

// businessRuleEngine is a shared module-level singleton (its ruleSets
// Map persists for the life of the process, same as in production —
// register() is meant to be called once at bootstrap). Each test below
// registers against its own unique, disposable entityKey so tests never
// see another test's accumulated rules.
let counter = 0;
function uniqueEntityKey() {
  return `test_entity_${counter++}`;
}

function makeSession(): Session {
  return { sub: "user@example.in", erpnext_roles: [], allowed_tools: [], credential: { mode: "api_key" } };
}

describe("businessRuleEngine.evaluate", () => {
  it("allows an action with no registered rules for that entity/action at all", async () => {
    const result = await businessRuleEngine.evaluate(uniqueEntityKey(), "create", {}, makeSession());
    expect(result).toEqual({ allowed: true, violations: [] });
  });

  it("allows the action when every registered rule passes (returns null)", async () => {
    const entityKey = uniqueEntityKey();
    const rule: BusinessRule = { id: "r1", action: "create", check: () => null };
    businessRuleEngine.register({ entityKey, rules: [rule] });

    const result = await businessRuleEngine.evaluate(entityKey, "create", {}, makeSession());
    expect(result).toEqual({ allowed: true, violations: [] });
  });

  it("collects a non-blocking violation but still allows the action", async () => {
    const entityKey = uniqueEntityKey();
    const rule: BusinessRule = {
      id: "r1",
      action: "create",
      check: () => ({ ruleId: "r1", message: "Unusual but not blocked.", blocking: false }),
    };
    businessRuleEngine.register({ entityKey, rules: [rule] });

    const result = await businessRuleEngine.evaluate(entityKey, "create", {}, makeSession());
    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([{ ruleId: "r1", message: "Unusual but not blocked.", blocking: false }]);
  });

  it("refuses the action when any registered rule reports a blocking violation", async () => {
    const entityKey = uniqueEntityKey();
    const passingRule: BusinessRule = { id: "r1", action: "create", check: () => null };
    const blockingRule: BusinessRule = {
      id: "r2",
      action: "create",
      check: () => ({ ruleId: "r2", message: "Supplier is blacklisted.", blocking: true }),
    };
    businessRuleEngine.register({ entityKey, rules: [passingRule, blockingRule] });

    const result = await businessRuleEngine.evaluate(entityKey, "create", {}, makeSession());
    expect(result.allowed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].ruleId).toBe("r2");
  });

  // Confirmed live 2026-08-18: the relay's own first real write attempt
  // (quotation.create) was unconditionally rejected because
  // quotation.warn_duplicate_open's check() threw (a live ERPNext lookup
  // with no connection available on that path) — and BEFORE this fix,
  // that ONE throw killed the whole evaluate() call, silently skipping
  // every OTHER rule for the same entity/action too. Real, shared bug —
  // affects the local single-tenant engine exactly the same way, not
  // relay-specific.
  it("a throwing rule degrades to a non-blocking violation, and does NOT prevent other rules for the same entity/action from still running", async () => {
    const entityKey = uniqueEntityKey();
    const throwingRule: BusinessRule = {
      id: "r1",
      action: "create",
      check: () => {
        throw new Error("no live connection available");
      },
    };
    const blockingRule: BusinessRule = {
      id: "r2",
      action: "create",
      check: () => ({ ruleId: "r2", message: "Genuinely blocked for a real reason.", blocking: true }),
    };
    businessRuleEngine.register({ entityKey, rules: [throwingRule, blockingRule] });

    const result = await businessRuleEngine.evaluate(entityKey, "create", {}, makeSession());
    // The throwing rule alone must never allow an otherwise-blocked
    // action through, and must never crash evaluate() itself.
    expect(result.allowed).toBe(false);
    expect(result.violations).toHaveLength(2);
    const thrown = result.violations.find((v) => v.ruleId === "r1")!;
    expect(thrown.blocking).toBe(false);
    expect(thrown.message).toContain("no live connection available");
    expect(result.violations.some((v) => v.ruleId === "r2" && v.blocking)).toBe(true);
  });

  it("a throwing rule alone (no other blocking rule) still allows the action — the same 'allow, but say so' outcome the rule's own non-blocking design implies", async () => {
    const entityKey = uniqueEntityKey();
    const throwingRule: BusinessRule = {
      id: "r1",
      action: "create",
      check: () => {
        throw new Error("boom");
      },
    };
    businessRuleEngine.register({ entityKey, rules: [throwingRule] });

    const result = await businessRuleEngine.evaluate(entityKey, "create", {}, makeSession());
    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([{ ruleId: "r1", message: expect.stringContaining("boom"), blocking: false }]);
  });

  // The real follow-up the two tests above intentionally left open,
  // built same day per explicit direction: a rule declares ITS OWN
  // policy for "what should happen if I can't even run" via
  // `failClosed` — a static field on the rule itself (its module's own
  // rules.ts, e.g. config/modules/selling/rules.ts), not something the
  // engine infers or guesses centrally.
  it("failClosed:true on a rule turns a throw into a genuine BLOCKING violation instead of a warning", async () => {
    const entityKey = uniqueEntityKey();
    const criticalRule: BusinessRule = {
      id: "r1",
      action: "create",
      failClosed: true,
      check: () => {
        throw new Error("credit limit service unreachable");
      },
    };
    businessRuleEngine.register({ entityKey, rules: [criticalRule] });

    const result = await businessRuleEngine.evaluate(entityKey, "create", {}, makeSession());
    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual([
      { ruleId: "r1", message: expect.stringContaining("credit limit service unreachable"), blocking: true },
    ]);
  });

  it("failClosed defaults to false when omitted — unchanged behavior for every existing rule", async () => {
    const entityKey = uniqueEntityKey();
    const rule: BusinessRule = {
      id: "r1",
      action: "create",
      // failClosed omitted entirely, same as every real rule in the
      // codebase today.
      check: () => {
        throw new Error("boom");
      },
    };
    businessRuleEngine.register({ entityKey, rules: [rule] });

    const result = await businessRuleEngine.evaluate(entityKey, "create", {}, makeSession());
    expect(result.allowed).toBe(true);
    expect(result.violations[0].blocking).toBe(false);
  });

  it("only evaluates rules registered for the matching action ('create' rules don't run on 'update')", async () => {
    const entityKey = uniqueEntityKey();
    const createOnlyRule: BusinessRule = {
      id: "r1",
      action: "create",
      check: () => ({ ruleId: "r1", message: "Should never fire on update.", blocking: true }),
    };
    businessRuleEngine.register({ entityKey, rules: [createOnlyRule] });

    const result = await businessRuleEngine.evaluate(entityKey, "update", {}, makeSession());
    expect(result).toEqual({ allowed: true, violations: [] });
  });

  it("supports an async check() and awaits it before deciding", async () => {
    const entityKey = uniqueEntityKey();
    const asyncRule: BusinessRule = {
      id: "r1",
      action: "create",
      check: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return { ruleId: "r1", message: "Async block.", blocking: true };
      },
    };
    businessRuleEngine.register({ entityKey, rules: [asyncRule] });

    const result = await businessRuleEngine.evaluate(entityKey, "create", {}, makeSession());
    expect(result.allowed).toBe(false);
  });

  it("passes the 'current' state through to check() only when provided (the update case)", async () => {
    const entityKey = uniqueEntityKey();
    const check = jest.fn().mockReturnValue(null);
    businessRuleEngine.register({ entityKey, rules: [{ id: "r1", action: "update", check }] });

    const current = { status: "Open" };
    await businessRuleEngine.evaluate(entityKey, "update", { status: "Closed" }, makeSession(), current);
    expect(check).toHaveBeenCalledWith({ status: "Closed" }, expect.any(Object), current);
  });

  it("accumulates rules across multiple register() calls for the same entityKey rather than overwriting", async () => {
    const entityKey = uniqueEntityKey();
    businessRuleEngine.register({ entityKey, rules: [{ id: "r1", action: "create", check: () => null }] });
    businessRuleEngine.register({
      entityKey,
      rules: [{ id: "r2", action: "create", check: () => ({ ruleId: "r2", message: "Second module's rule.", blocking: true }) }],
    });

    const result = await businessRuleEngine.evaluate(entityKey, "create", {}, makeSession());
    expect(result.allowed).toBe(false);
    expect(result.violations[0].ruleId).toBe("r2");
  });
});
