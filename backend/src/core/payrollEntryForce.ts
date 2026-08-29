/**
 * Same "stop trusting the model to choose the right tool for this
 * specific, well-known question shape" philosophy as
 * compensationSuperlativeForce.ts, applied to a second confirmed-live
 * case: confirmed live 2026-08-16, the exact same prompt ("List
 * Payroll_entry" / "List payroll entries") in the exact same session
 * failed once ("I don't have access to the payroll_entry.list tool" —
 * despite the tool genuinely being in that session's real tool list)
 * then succeeded on an immediate retry with no change at all. The
 * SYSTEM_PROMPT already has an explicit paragraph telling the model to
 * check its real tool list before claiming an access gap — this is that
 * exact failure mode still happening some of the time, so (same move as
 * the compensation fix) the pre-fetch happens server-side before the
 * model's first turn, removing the model's OWN tool-selection judgment
 * from the failure path entirely for this specific, well-known question
 * shape.
 *
 * Deliberately narrow (own pure detector, one specific entity) — this is
 * for a confirmed-live recurring failure, not a general "guess what tool
 * the model needs" mechanism. Kept dependency-free (no gateway/session
 * import) so detection is directly unit-testable, same discipline as
 * compensationSuperlativeForce.ts — the actual forced call happens in
 * reasoningEngine.ts's run(), which has access to session/callTool.
 */

export const PAYROLL_ENTRY_TOOL = "payroll_entry.list";

// "payroll" alone (not the broader salary/pay/compensation vocabulary
// COMPENSATION_KEYWORD_PATTERN already owns in compensationSuperlativeForce.ts)
// — this is specifically about the payroll RUN/batch entity
// (payroll_entry), not an individual employee's compensation. The two
// detectors deliberately overlap only at the edges (e.g. a message
// mentioning both "payroll" and "highest paid") and both firing on the
// same message is harmless — each seeds its own independent pre-fetch.
// No trailing \b: the confirmed-live failing prompt was literally
// "List Payroll_entry" (the raw entity name, underscore and all) —
// regex \b treats "_" as a word character, so a trailing \b would NOT
// match between "Payroll" and "_entry" and silently miss the exact case
// this exists to fix.
const PAYROLL_PATTERN = /\bpayroll/i;

/** True when the message is unambiguously asking about payroll RUNS
 *  (the payroll_entry entity), not just mentioning payroll in passing
 *  as part of a compensation-ranking question (that's
 *  compensationSuperlativeForce.ts's territory) — narrowed to the
 *  confirmed-live phrasing shape: "payroll" plus a listing/lookup verb,
 *  the same shape a genuine payroll_entry.list request takes. */
const LOOKUP_VERB_PATTERN = /\b(list|show|give|view|see|what|which|how many|find|pull up|display)\b/i;

export function detectPayrollEntryPhrase(message: string): boolean {
  return PAYROLL_PATTERN.test(message) && LOOKUP_VERB_PATTERN.test(message);
}

/** Args for the forced payroll_entry.list call — sorted newest-run-first,
 *  the same "latest N" default this app uses elsewhere absent any other
 *  signal from the user's own wording. */
export function buildForcedPayrollEntryListArgs(): { sortBy: string; sortDir: "asc" | "desc"; limit: number } {
  return { sortBy: "end_date", sortDir: "desc", limit: 100 };
}

export const PAYROLL_ENTRY_FORCED_HINT =
  `Real payroll run data has already been fetched for you via ${PAYROLL_ENTRY_TOOL} (sorted by end_date, most ` +
  `recent first — see the tool result already in this conversation) specifically because this looks like a ` +
  `payroll-entry question. Use that real data directly to answer — do NOT call ${PAYROLL_ENTRY_TOOL} again, it ` +
  `would just repeat the same result, and do NOT claim you lack access to it (you clearly just used it).`;
