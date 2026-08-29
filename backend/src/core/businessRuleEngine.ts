import { BusinessRule, RuleSet, RuleViolation, Session } from "./types";

export interface RuleEvaluation {
  allowed: boolean;
  violations: RuleViolation[];
}

/**
 * Domain-agnostic business-rule engine — same shape and discipline as
 * workflowEngine.ts: a generic engine here, one small per-module
 * RuleSet in config/rules/<module>.rules.ts describing what "normal
 * practice" actually is for that entity. Has no idea whether the
 * entity underneath is an ERPNext Lead, an SAP sales document, or a
 * patient admission record.
 */
class BusinessRuleEngine {
  private ruleSets = new Map<string, BusinessRule[]>();

  register(ruleSet: RuleSet) {
    const existing = this.ruleSets.get(ruleSet.entityKey) || [];
    this.ruleSets.set(ruleSet.entityKey, [...existing, ...ruleSet.rules]);
  }

  async evaluate(
    entityKey: string,
    action: "create" | "update",
    args: Record<string, any>,
    session: Session,
    current?: Record<string, any>
  ): Promise<RuleEvaluation> {
    const rules = (this.ruleSets.get(entityKey) || []).filter((r) => r.action === action);
    const violations: RuleViolation[] = [];

    for (const rule of rules) {
      // A rule's check() can throw (e.g. a rule that makes a live lookup
      // when no connection is available). Each rule is isolated: a thrown
      // check becomes its own synthetic violation rather than aborting
      // the loop, so one failing rule never stops the others from
      // running. The synthetic violation is non-blocking by default; a
      // rule can opt into fail-closed behaviour with `failClosed: true`
      // (see BusinessRule in types.ts).
      let violation: RuleViolation | null;
      try {
        violation = await rule.check(args, session, current);
      } catch (err) {
        const blocking = !!rule.failClosed;
        console.error(
          `[businessRuleEngine] rule "${rule.id}" threw during evaluation — ${blocking ? "failClosed:true, BLOCKING this action" : "treated as non-blocking, not enforced this call"}`,
          err
        );
        violation = {
          ruleId: rule.id,
          message: blocking
            ? `Could not verify "${rule.id}" (${(err as Error).message}) — blocked, this check is required to pass.`
            : `Could not verify "${rule.id}" (${(err as Error).message}) — this check did not run.`,
          blocking,
        };
      }
      if (violation) violations.push(violation);
    }

    return { allowed: !violations.some((v) => v.blocking), violations };
  }
}

export const businessRuleEngine = new BusinessRuleEngine();
