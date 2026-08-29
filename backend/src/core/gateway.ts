import { Session, ToolDefinition } from "./types";
import { moduleRegistry } from "./moduleRegistry";
import { businessRuleEngine } from "./businessRuleEngine";
import { ruleOutcomeLogger } from "./ruleOutcomeLogger";

export class ToolNotAllowedError extends Error {
  constructor(toolName: string) {
    super(`Tool "${toolName}" is not permitted for this user's role(s).`);
    this.name = "ToolNotAllowedError";
  }
}

export class RuleViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleViolationError";
  }
}

/**
 * SINGLE enforcement + execution point for every tool call, whether it
 * comes from the LLM's own planning or a direct REST route. Nothing
 * else is allowed to call a tool handler directly — this is what makes
 * the role-based filtering and business-rule enforcement trustworthy
 * and auditable in one place.
 */
export async function callTool(session: Session, toolName: string, args: any) {
  const allowed = session.allowed_tools.includes("*") || session.allowed_tools.includes(toolName);
  if (!allowed) throw new ToolNotAllowedError(toolName);

  const tool = moduleRegistry.findTool(toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);

  let ruleWarnings: string[] = [];
  if (tool.entityKey && tool.ruleAction) {
    const evaluation = await businessRuleEngine.evaluate(tool.entityKey, tool.ruleAction, args, session);
    await ruleOutcomeLogger.log({
      entity_key: tool.entityKey,
      action: tool.ruleAction,
      actor_email: session.sub,
      allowed: evaluation.allowed,
      violations: evaluation.violations,
      args,
      created_at: new Date().toISOString(),
    });
    if (!evaluation.allowed) {
      throw new RuleViolationError(evaluation.violations.map((v) => v.message).join(" "));
    }
    // Confirmed live 2026-08-11 (manual business-rule audit): a
    // non-blocking ("warn, don't block") violation was evaluated and
    // logged to the audit trail above, then completely discarded — the
    // caller only ever got `tool.handler`'s own return value, with no
    // path for the warning message to ever reach the LLM or the user.
    // This made EVERY "flag a likely-duplicate" rule in the codebase
    // (quotation/sales_order/purchase_order/opportunity/lead/issue/task/
    // quality_inspection's own warn_duplicate_* rules — 8 total) silently
    // inert: evaluated correctly, but never actually surfaced to anyone.
    ruleWarnings = evaluation.violations.filter((v) => !v.blocking).map((v) => v.message);
  }

  const result = await tool.handler(args, session);
  // Only ever changes the shape when there's a real warning to attach —
  // the overwhelmingly common case (no ruleAction at all, i.e. every
  // *.list/*.get tool; or a create/update with zero violations) returns
  // `result` completely unchanged, byte-identical to before this fix.
  // Guarded to plain-object results only (never an array) since
  // businessRuleEngine only ever evaluates create/update actions, whose
  // handlers return a single record, not a list — this can never affect
  // *.list's row-array shape or pollute a rendered table.
  if (ruleWarnings.length && result && typeof result === "object" && !Array.isArray(result)) {
    return { ...result, _business_rule_notes: ruleWarnings };
  }
  return result;
}

export function listAllowedTools(session: Session): ToolDefinition[] {
  const all = moduleRegistry.getAllTools();
  if (session.allowed_tools.includes("*")) return all;
  return all.filter((t) => session.allowed_tools.includes(t.name));
}
