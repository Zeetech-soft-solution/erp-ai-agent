/**
 * Per-message hints. When a detector in core/ recognises a phrase in the
 * user's message (a relative date, a count, a chart request ...), the
 * engine appends the matching hint to that message only. Empty hints are
 * skipped. Hint text is not shipped in this distribution; provide your own.
 */

/** Appended when a relative period ("last week") is detected.
 *  `period` is the detected key, `range` the resolved [from, to] dates. */
export function dateHint(_period: string, _range: string[]): string {
  return "";
}

/** Appended when the turn comes from a next-step button the user clicked. */
export const CONFIRMED_ACTION_HINT = "";
