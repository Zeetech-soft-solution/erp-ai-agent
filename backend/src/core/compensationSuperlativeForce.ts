/**
 * Follow-up to correctStatedSuperlative (reasoningEngine.ts) and
 * CROSS_ENTITY_FIELD_HINTS (erpnextConnector.ts) — both closed real,
 * confirmed-live bugs for "highest/lowest paid employee" questions, but
 * only AFTER the model actually called salary_structure_assignment.list
 * that turn. Confirmed live 2026-08-13, repeat-testing the exact same
 * question: it doesn't reliably do that — it sometimes calls
 * analytics.aggregate against "employee" (no compensation fields exist
 * there at all, see CROSS_ENTITY_FIELD_HINTS) plus employee.get instead,
 * and in that path there's no real ctc data anywhere this turn for
 * correctStatedSuperlative to check the model's prose against — it can
 * still fabricate a name and a number with nothing to correct.
 *
 * Same "stop trusting the model to choose the right tool for this
 * specific, well-known question shape" philosophy as reasoningEngine.ts's
 * own isGroupAggregate/isSingleRecord (forced regardless of what the
 * model's DISPLAY_INTENT said) — just applied one step earlier, to the
 * TOOL CALL itself instead of the render. Deliberately narrow (own
 * pure detector, one specific entity/field), matching this file's
 * established discipline: this is for a confirmed-live recurring failure,
 * not a general "guess what tool the model needs" mechanism.
 *
 * Kept as pure, dependency-free functions (no gateway/session import)
 * so the detection logic is directly unit-testable — the actual forced
 * tool call happens in reasoningEngine.ts's run(), which is what has
 * access to `session`/`callTool`.
 */

export const COMPENSATION_SUPERLATIVE_TOOL = "salary_structure_assignment.list";

// Same two patterns correctStatedSuperlative already uses to recognize a
// superlative claim in the model's OUTPUT — reused here to recognize the
// same shape in the user's INPUT, so both ends of this fix agree on what
// "highest/lowest" means. Exactly one of the two must match (a message
// naming neither, or confusingly naming both, is not a clean case to
// force a sort direction for).
const HIGHEST_PATTERN = /\b(highest|largest|maximum|most|top)\b/i;
const LOWEST_PATTERN = /\b(lowest|smallest|minimum|least)\b/i;

// Deliberately narrow to real compensation vocabulary — never a bare
// "most"/"top" alone (that's GROUPING_QUESTION_PATTERN's territory in
// countQuestionHint.ts, a different, much broader class of question).
// "package"/"wage(s)" added alongside the SYSTEM_PROMPT's own existing
// "salary/compensation/ctc/pay" wording for the same reason
// CROSS_ENTITY_FIELD_HINTS covers several field-name synonyms — real
// users phrase this several ways.
const COMPENSATION_KEYWORD_PATTERN = /\b(salary|salaries|paid|pay|compensation|ctc|package|wage|wages)\b/i;

/**
 * Returns "highest"/"lowest" when the message is unambiguously a
 * compensation-ranking question, else null. Pure keyword matching over
 * the user's own raw text — same "never an LLM call" discipline as
 * detectRelativePeriodPhrase/detectCountQuestionPhrase.
 */
export function detectCompensationSuperlativePhrase(message: string): "highest" | "lowest" | null {
  if (!COMPENSATION_KEYWORD_PATTERN.test(message)) return null;
  const highest = HIGHEST_PATTERN.test(message);
  const lowest = LOWEST_PATTERN.test(message);
  if (highest === lowest) return null; // neither, or both (ambiguous) — don't force a direction
  return highest ? "highest" : "lowest";
}

/** Args for the forced salary_structure_assignment.list call — sorted so
 * the true extreme is always row[0] of the result regardless of page size
 * (correctness here comes from the sort direction, not from fetching the
 * whole company — the list default page size is an admin setting that can
 * change independently, see erpnextConnector.ts's list(), so this passes
 * its own small explicit limit rather than leaning on whatever that
 * default happens to be). A few extra rows beyond the top one are kept so
 * the model can also name next-highest/lowest context if asked. */
export function buildForcedCompensationListArgs(direction: "highest" | "lowest"): { sortBy: string; sortDir: "asc" | "desc"; limit: number } {
  return { sortBy: "ctc", sortDir: direction === "highest" ? "desc" : "asc", limit: 5 };
}

export const COMPENSATION_SUPERLATIVE_FORCED_HINT =
  `Real compensation data has already been fetched for you via ${COMPENSATION_SUPERLATIVE_TOOL} ` +
  `(sorted by ctc — see the tool result already in this conversation) specifically because this looks like a ` +
  `compensation-ranking question. Use that real data directly to answer. Do NOT call analytics.aggregate against ` +
  `"employee" for this (it has no salary/ctc/net_pay field at all) and do NOT call salary_structure_assignment.list ` +
  `again — it would just repeat the same result. If you need a name/department for a specific row, call ` +
  "employee.get on that row's own \"employee\" id only.";
