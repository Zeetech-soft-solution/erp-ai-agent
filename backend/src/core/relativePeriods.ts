/**
 * Fixed vocabulary for relative-date tool filters (e.g. {"op":"relative",
 * "value":"last_week"}) — deliberately ERP-agnostic (core/, not
 * erpnext/), same discipline as EntityConfig/WorkflowDefinition: a
 * future SAP connector wants "last week"/"this month" as calendar
 * concepts too, nothing here should ever mention ERPNext.
 *
 * Exists because asking the LLM to compute a relative date range ITSELF
 * — even with "today's date" given, even with pre-computed [start,end]
 * anchors handed to it to copy — was confirmed live to be unreliable:
 * repeated fresh-session tests of the identical "last week" query got a
 * correct two-sided range only ~2 times out of 3, and one run dropped
 * the date condition entirely. The actual industry-standard fix for
 * this class of problem (per OpenAI/Anthropic function-calling
 * guidance) is to never ask a model to do date arithmetic at all — only
 * to classify which of a small fixed set of periods the user meant, and
 * resolve the real dates in deterministic code. This is that: exported
 * so entityModuleFactory.ts's generated tool description can enumerate
 * the exact same list the resolver actually accepts, never a separately
 * hand-maintained copy that could drift out of sync.
 */
export const RELATIVE_PERIODS = [
  "today", "yesterday", "day_before_yesterday", "this_week", "last_week", "this_month", "last_month",
  "last_7_days", "last_14_days", "last_30_days", "last_60_days", "this_year",
] as const;
export type RelativePeriod = (typeof RELATIVE_PERIODS)[number];

/** Resolves a fixed relative-period keyword into a real [start, end]
 *  calendar-date pair. All weeks are Monday-start (Mon-Sun) — confirmed
 *  with the user 2026-08-09: today (Sun 2026-08-09) -> last_week =
 *  2026-07-27 to 2026-08-02, a genuine calendar week, NOT a sliding
 *  "trailing 7 days" (that's what last_7_days is for, kept as a
 *  separate, deliberately different option). Computed entirely with
 *  UTC-explicit Date math on an already-resolved "today" string (the
 *  caller is responsible for deriving that in whatever timezone this
 *  deployment's business day boundary actually follows — see
 *  reasoningEngine.ts's own "today", Asia/Kolkata for this deployment)
 *  — pure calendar-date arithmetic has no time-of-day component, so the
 *  timezone only matters once, in resolving "today" itself. */
export function resolveRelativePeriod(rawPeriod: string, todayIso: string): [string, string] {
  // Tolerate near-misses of the exact vocabulary ("Last Week", "last-week",
  // " last_week ") rather than hard-failing on a spelling variation the
  // model was never actually wrong ABOUT semantically — the whole point
  // of this fixed-vocabulary approach is to make the model's job trivial
  // (classify, don't compute), so an exact-string-match landmine over a
  // harmless casing/separator difference would undermine that.
  const period = rawPeriod.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const [y, m, d] = todayIso.split("-").map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const addDays = (date: Date, n: number) => new Date(date.getTime() + n * 86400000);
  const fmt = (date: Date) => date.toISOString().slice(0, 10);
  const dow = today.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const sinceMonday = (dow + 6) % 7; // Monday = 0, ..., Sunday = 6
  const thisMonday = addDays(today, -sinceMonday);

  switch (period as RelativePeriod) {
    case "today":
      return [todayIso, todayIso];
    case "yesterday": {
      const y1 = fmt(addDays(today, -1));
      return [y1, y1];
    }
    // Confirmed live 2026-08-12: "who absent day before yesterday" (today
    // = Aug 12) got answered with Aug 11's data mislabeled as "the day
    // before yesterday" — Aug 11 is yesterday; the day before yesterday
    // is Aug 10. Root cause was detectRelativePeriodPhrase's own
    // /\byesterday\b/i pattern matching the "yesterday" SUBSTRING inside
    // "day before yesterday" and handing the model an explicit (wrong)
    // instruction to use value:"yesterday" — the model just complied.
    // Real fix, not just a phrase-ordering patch: this needed its own
    // proper vocabulary entry and resolved date, same as any other fixed
    // period here.
    case "day_before_yesterday": {
      const d2 = fmt(addDays(today, -2));
      return [d2, d2];
    }
    case "this_week":
      return [fmt(thisMonday), fmt(addDays(thisMonday, 6))];
    case "last_week":
      return [fmt(addDays(thisMonday, -7)), fmt(addDays(thisMonday, -1))];
    case "this_month":
      return [`${todayIso.slice(0, 7)}-01`, todayIso];
    case "last_month": {
      const firstOfThisMonth = new Date(Date.UTC(y, m - 1, 1));
      const lastOfLastMonth = addDays(firstOfThisMonth, -1);
      const firstOfLastMonth = new Date(Date.UTC(lastOfLastMonth.getUTCFullYear(), lastOfLastMonth.getUTCMonth(), 1));
      return [fmt(firstOfLastMonth), fmt(lastOfLastMonth)];
    }
    case "last_7_days":
      return [fmt(addDays(today, -7)), todayIso];
    // Confirmed live 2026-08-12 (pm2 error log): both "who's on leave in
    // the last 2 weeks" and "quotations from the last 2 months" got
    // rejected with "Unknown relative period" — a real, repeatable user
    // phrasing gap in the vocabulary, not a model mistake to correct.
    // Added as trailing-N-days ranges (same shape as last_7_days/
    // last_30_days above), not calendar-week/month multiples — "last 2
    // weeks" means the same kind of thing to a user as "last 7 days"
    // does, a trailing window, not a calendar-aligned one.
    case "last_14_days":
      return [fmt(addDays(today, -14)), todayIso];
    case "last_30_days":
      return [fmt(addDays(today, -30)), todayIso];
    case "last_60_days":
      return [fmt(addDays(today, -60)), todayIso];
    case "this_year":
      return [`${y}-01-01`, todayIso];
    default:
      throw new Error(`Unknown relative period "${period}" — must be one of: ${RELATIVE_PERIODS.join(", ")}`);
  }
}

// Ordered so a longer/more specific phrase is tried before a shorter one
// that could otherwise match a substring of it first (e.g. "this week"
// must be checked before a hypothetical bare "week" pattern would be).
const PHRASE_PATTERNS: [RegExp, RelativePeriod][] = [
  [/\blast\s+7\s+days\b/i, "last_7_days"],
  [/\bpast\s+week\b/i, "last_7_days"],
  [/\blast\s+30\s+days\b/i, "last_30_days"],
  [/\bpast\s+month\b/i, "last_30_days"],
  // Must precede the bare "last week"/"last month" patterns below — "last
  // 2 weeks"/"last two months" etc. contain those shorter phrases'
  // meaning but mean a wider trailing window, not the single calendar
  // period the shorter pattern resolves to.
  [/\blast\s+(?:2|two)\s+weeks\b/i, "last_14_days"],
  [/\blast\s+14\s+days\b/i, "last_14_days"],
  [/\blast\s+(?:2|two)\s+months\b/i, "last_60_days"],
  [/\blast\s+60\s+days\b/i, "last_60_days"],
  [/\blast\s+week\b/i, "last_week"],
  [/\bthis\s+week\b/i, "this_week"],
  [/\blast\s+month\b/i, "last_month"],
  [/\bthis\s+month\b/i, "this_month"],
  [/\bthis\s+year\b/i, "this_year"],
  // Must precede the bare "yesterday" pattern below — both "day before
  // yesterday" and "2 days ago" contain/mean something the shorter
  // pattern would otherwise wrongly match first (see this file's own
  // "longer/more specific phrase first" ordering rule above).
  [/\bday\s+before\s+yesterday\b/i, "day_before_yesterday"],
  [/\b2\s+days?\s+ago\b/i, "day_before_yesterday"],
  [/\btwo\s+days?\s+ago\b/i, "day_before_yesterday"],
  [/\byesterday\b/i, "yesterday"],
  [/\btoday\b/i, "today"],
];

/**
 * Plain keyword/phrase detection over the user's OWN raw message text —
 * deliberately not an LLM call, just a fixed pattern match, exactly
 * mirroring the fixed vocabulary resolveRelativePeriod() accepts. Used
 * by reasoningEngine.ts to append an already-computed date hint directly
 * onto the specific message that needs it (see that file's call site for
 * why this landed here instead of only being a general system-prompt
 * rule: confirmed live, a rule competing for attention among many others
 * in a long system prompt was NOT reliably followed on compound queries
 * — e.g. "quotations that haven't converted... last week" has two
 * conditions, and the date one kept getting dropped or applied only on
 * a second, self-corrected attempt). Returns the first phrase matched,
 * or null if the message doesn't mention any of the fixed vocabulary at
 * all (most messages — this is deliberately narrow, not a general NLP
 * date parser).
 */
export function detectRelativePeriodPhrase(text: string): RelativePeriod | null {
  for (const [pattern, period] of PHRASE_PATTERNS) {
    if (pattern.test(text)) return period;
  }
  return null;
}
