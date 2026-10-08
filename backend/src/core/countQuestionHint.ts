/**
 * Confirmed live 2026-08-10: "how many employees were absent this month
 * compared to last month" got attendance.list called twice (no analytics
 * tool at all) and the model eyeballed/miscounted the results — stated
 * "42" and "63" against a real ground truth of 31 events/27 distinct
 * employees (August) and 120 events/70 distinct employees (July, itself
 * capped by the default 100-row list limit). analytics.aggregate with
 * op:"count" already exists and computes this correctly server-side (see
 * modules/analytics/index.ts's own doc comment: "never estimate these
 * yourself, always call these tools") — the SYSTEM_PROMPT already says
 * so in general terms, but that's the same weak-signal shape
 * detectRelativePeriodPhrase was built to fix for dates: a rule
 * competing for attention among many others in a long system prompt.
 *
 * Same fix, same reasoning, deliberately kept just as simple: plain
 * keyword matching over the user's OWN raw message (not an LLM call),
 * and when it matches, append a concrete, un-ignorable instruction onto
 * THAT SPECIFIC message rather than adding yet another general rule.
 */
const COUNT_QUESTION_PATTERN = /\bhow many\b|\bcount of\b|\bnumber of\b|\bcompare(?:d|s)?\b|\bversus\b|\bvs\.?\b/i;

// Confirmed live 2026-08-11: "compare this month's inspection pass rate
// to last month's" got the real counts right this time (analytics.
// aggregate op:count fixed that class of bug above) but still answered
// with raw "accepted" counts (21 vs 64) as if that WERE the rate,
// instead of a real percentage — comparing volume across two unequal
// periods, not a proportion. analytics.percentage already exists for
// exactly this (own doc comment: "never compute this yourself by
// dividing two separate .list/.aggregate results in your head") but
// wasn't used. A distinct phrase from a plain count question, so it
// gets its own detector and its own, more specific hint.
const RATE_QUESTION_PATTERN = /\brate\b|\bpercentage\b|\bpercent\b|%|\bproportion\b|\bratio\b/i;

// Confirmed live 2026-08-11: "which customer has the most open
// quotations right now, and what's their total value?" got the WRONG
// answer — "Royal Power Systems Enterprises, 2 quotations" when the real
// max is "Vishal Enterprises & Co" with 4 (confirmed via direct SQL
// GROUP BY). Root cause: the model fetched one page of quotations, then
// individually re-queried ~7 customers it happened to notice — a "sample
// a few groups and guess" approach that can silently miss the real
// winner across an unbounded set of possible groups. analytics.aggregate
// already supports groupBy (its own doc comment: "break the result down
// by another field with groupBy") but wasn't used — a single groupBy
// call returns an exact, complete per-group breakdown, not a guess.
// Confirmed live 2026-08-15: "show me a bar chart of leads broken down by
// status" reproduced the EXACT same "sample and guess" failure mode above,
// worse — the pattern below didn't fire at all, since "broken down" (two
// words) doesn't match the single compound word "breakdown". With no
// GROUPING_QUESTION_HINT, the model called analytics.aggregate TWELVE
// times guessing individual status literals one at a time ("Lead",
// "Opportunity", "Interested", "Converted", "Lost" — several of those
// aren't even real Lead statuses, they're Opportunity ones; it also
// flip-flopped entityKey between "lead" and "opportunity" mid-guess),
// most guesses came back 0, it exhausted the turn's tool-call budget
// without ever calling groupBy, and the user got the honest-failure
// fallback message plus a garbled raw dump of 9 near-identical {overall:
// {value:0,count:0}} results. "broken down" is at least as common a
// phrasing as "breakdown" for this exact request shape — added here
// rather than assuming the single compound word covers it.
const GROUPING_QUESTION_PATTERN = /\b(most|least|highest|lowest|top|biggest|largest|smallest|fewest)\b|\bbreak\s?down\b|\bbroken down\b|\bgroup(?:ed)?\b|\bper (?:customer|supplier|department|employee|item|warehouse|territory|category)\b/i;

// Confirmed live 2026-08-12: "what's the total accounts receivable, and
// who are the top 3 customers by amount owed" got the real total right
// but then wrote "Here are the top 3 customers by amount owed: overall
// [object Object] [object Object]" — analytics.aggregate's groupBy result
// came back clean ({overall:{...}, groups:[{key,value,count}, ...]}), but
// instead of reading each group's own key/value fields, the model wrote
// JS's default object-to-string coercion straight into its prose. A code
// backstop now strips that artifact and forces a real table for this
// exact shape (reasoningEngine.ts's toGroupAggregateTableRows/buildResponse),
// but the hint is strengthened too — same "close the gap at the prompt
// AND in code" pattern as every other fix here, since the code backstop
// only cleans up after the fact, it doesn't stop the bad prose from
// almost-always needing cleanup in the first place.

// Confirmed live 2026-08-14: "Create a quick dashboard of how the sales
// are shaping up in the last 6 months. Use publicly available Sales KPI
// for comparison" got a technically-honest but practically-useless
// answer — it correctly declined to invent external benchmark numbers,
// but then just dumped ALL 105 individual sales_invoice.list rows for
// the period into a table and called that "a summary," with no totals,
// no trend, no chart, nothing a real KPI dashboard would show. Same root
// cause as every hint in this file: analytics.aggregate already exists
// and is exact, but none of the count/rate/grouping patterns above share
// wording with this class of request, so nothing pushed the model toward
// it — it fell back to the one tool whose job is listing individual
// records.
//
// Split into separate labeled word groups (rather than one opaque
// regex) so each real-world phrasing category — "build me a chart",
// "what's our KPI", "give me the analytics", "dashboard/overview" — is
// independently visible and extendable without re-reading a single long
// pattern. All four route to the same remedy (compute via
// analytics.aggregate, don't dump a raw list), so they share one hint;
// only the trigger wording is split.
// A bare mention of "trend" is kept in the DASHBOARD bucket (below) since a
// real trend line inherently needs multiple periods of real numbers — the
// one thing the simple one-shot auto-render path (SIMPLE_CHART_HINT below)
// cannot produce. "chart"/"graph"/"plot"/"visualize" alone are deliberately
// NOT trend words — see SIMPLE_CHART_WORDS' own doc comment for why they
// used to live here and had to move out.
const TREND_WORDS = /\btrend(?:line|s)?\b/i;
// "total"/"average"/"sum"/"growth" alone are common colloquial asks for a
// computed number ("what's the total sales this month", "average deal
// size", "sales growth vs last quarter") — broader than "kpi" by name but
// the same remedy applies, so they belong in this bucket rather than a
// 5th category. yoy/mom/qoq are the standard business abbreviations for
// period-over-period growth comparisons.
const KPI_WORDS =
  /\bkpis?\b|\bkey performance indicators?\b|\bmetrics?\b|\bbenchmarks?\b|\btargets?\b|\btotals?\b|\baverages?\b|\bavg\b|\bsums?\b|\bgrowth\b|\byoy\b|\bmom\b|\bqoq\b|\byear[- ]over[- ]year\b|\bmonth[- ]over[- ]month\b|\bquarter[- ]over[- ]quarter\b/i;
const ANALYTICS_WORDS = /\banalytics\b|\banaly[sz]e\b|\banaly[sz]is\b|\binsights?\b|\bstat(?:s|istics)?\b|\bsnapshot\b|\bnumbers\b|\bfigures\b/i;
const DASHBOARD_WORDS = /\bdashboard\b|\boverview\b|\bscorecard\b|\breport card\b|\bshaping up\b|\bperformance (?:overview|summary)\b|\bhow (?:is|are|has) .*(?:doing|performing)\b/i;
const DASHBOARD_QUESTION_PATTERN = new RegExp(
  [TREND_WORDS, KPI_WORDS, ANALYTICS_WORDS, DASHBOARD_WORDS].map((r) => r.source).join("|"),
  "i"
);

// Confirmed live 2026-08-17: a real user (not this session's own testing)
// asked "get me lead graph" then, minutes later, "give me chart of leads" —
// both bare, single-entity chart requests with no dashboard/kpi/trend
// signal at all. SYSTEM_PROMPT already documents the correct, SIMPLEST
// path for exactly this shape: call that entity's own *.list tool ONCE and
// end with DISPLAY_INTENT:{"render":"chart"} — the auto-render counts
// records by whichever category field applies, no analytics call needed.
// Neither turn used it. Root cause: CHART_WORDS ("chart"/"graph"/"plot"/
// "visualize") used to be unconditionally OR'd into DASHBOARD_QUESTION_
// PATTERN above, so EVERY bare chart/graph mention — not just genuine
// dashboard/KPI/trend requests — fired DASHBOARD_QUESTION_HINT, which
// explicitly instructs calling analytics.aggregate for totals and (if a
// trend is implied) once per period. For a bare "chart of leads" that
// instruction is simply wrong-sized: the model followed it faithfully
// (real 2026-08-17 log: 3-10 analytics.aggregate/calculate calls, including
// nonsensical sum/avg of the "id" field on one turn), never called
// chart.build OR the one-shot list+auto-render path, and the user got no
// chart at all, twice. Fixed at the source (DASHBOARD_QUESTION_PATTERN no
// longer includes bare chart/graph/plot/visualize, only real trend/kpi/
// analytics/dashboard wording) and reinforced here with a hint pointing
// straight at the simple, already-documented remedy — same "close the gap
// in the SYSTEM_PROMPT's own coverage, not just add a bigger hammer"
// pattern as every other fix in this file. Deliberately excludes anything
// CHART_TOOL_PATTERN or DASHBOARD_QUESTION_PATTERN already own (pie/donut/
// line/bar/multiple-charts, or genuine trend/kpi/analytics/dashboard
// wording) — those need the heavier real remedies those hints already give,
// and firing both at once would tell the model two contradictory things.
const SIMPLE_CHART_WORDS = /\bchart\b|\bgraph\b|\bplot\b|\bvisuali[sz]e\b|\bvisuali[sz]ation\b/i;

export function detectSimpleChartPhrase(message: string): boolean {
  return (
    SIMPLE_CHART_WORDS.test(message) &&
    !CHART_TOOL_PATTERN.test(message) &&
    !DASHBOARD_QUESTION_PATTERN.test(message)
  );
}

// Hint text is not shipped in this distribution; provide your own (see systemPrompt/core/hints.ts).
export const SIMPLE_CHART_HINT = "";

export function detectCountQuestionPhrase(message: string): boolean {
  return COUNT_QUESTION_PATTERN.test(message);
}

export function detectDashboardQuestionPhrase(message: string): boolean {
  return DASHBOARD_QUESTION_PATTERN.test(message);
}

export function detectRateQuestionPhrase(message: string): boolean {
  return RATE_QUESTION_PATTERN.test(message);
}

export function detectGroupingQuestionPhrase(message: string): boolean {
  return GROUPING_QUESTION_PATTERN.test(message);
}

// Hint text is not shipped in this distribution; provide your own (see systemPrompt/core/hints.ts).
export const COUNT_QUESTION_HINT = "";

// Hint text is not shipped in this distribution; provide your own (see systemPrompt/core/hints.ts).
export const RATE_QUESTION_HINT = "";

// Hint text is not shipped in this distribution; provide your own (see systemPrompt/core/hints.ts).
export const GROUPING_QUESTION_HINT = "";

// Hint text is not shipped in this distribution; provide your own (see systemPrompt/core/hints.ts).
export const DASHBOARD_QUESTION_HINT = "";

// Confirmed live 2026-08-14, the SAME night analytics.correlate was added:
// "is there a correlation between employee base salary and their total
// CTC?" never called analytics.correlate at all — the model fetched TWO
// separate analytics.aggregate SUMS (total base salary across all 96
// employees; total CTC across all 96) and fed them into
// analytics.calculate with op:"growth", reporting a nonsensical "-95.83%
// growth" as if summed CTC had "declined" into summed salary. Two
// distinct mistakes stacked: (1) growth measures a before/after change
// over time, not a relationship between two different unrelated totals —
// wrong op entirely; (2) even the right op would have been meaningless
// here, since correlation needs PAIRED PER-RECORD values (96 pairs of
// [employee's own base_salary, that SAME employee's own ctc]), not two
// single aggregated numbers with no pairing at all. Root cause: nothing
// in COUNT/RATE/GROUPING/DASHBOARD's wording covers "correlation" — the
// word never appeared in the KPI dashboard fix's ANALYTICS_WORDS either
// (that covered "analytics/analyze/insights/stats", not "correlate") —
// so no hint ever pointed the model at analytics.correlate, and it
// substituted the nearest tool it already had a habit of reaching for.
const CORRELATION_QUESTION_PATTERN = /\bcorrelat(?:e[sd]?|ion)\b|\brelationship between\b/i;

export function detectCorrelationQuestionPhrase(message: string): boolean {
  return CORRELATION_QUESTION_PATTERN.test(message);
}

// Added 2026-08-15 alongside the new chart.build tool (modules/chart):
// the auto-rendered DISPLAY_INTENT:"chart" pathway only ever draws one
// shape (count-by-category bars) — it has no way to produce a pie/donut,
// a real trend line, or more than one chart in a reply. Without a hint
// pointing at chart.build specifically, an explicit "pie chart"/"donut"
// request has nothing in the four hint categories above that would ever
// steer the model toward it (same class of gap CORRELATION_QUESTION_HINT
// closed for "correlation" wording) — it would either get silently
// rendered as a bar chart anyway or answered in prose. "dashboard with
// a few different charts"/"several charts" is included here too since
// that specifically needs MULTIPLE chart.build calls in one turn (see
// that tool's own description), not just the single-chart DASHBOARD_
// QUESTION_HINT remedy above.
// "bar chart"/"bar graph" added after the 2026-08-15 "leads broken down by
// status" failure above — that prompt named "bar chart" explicitly too,
// and while the OLD auto-render path CAN draw a plain bar, reinforcing
// chart.build's fetch-with-groupBy-THEN-build sequence here as well costs
// nothing and gives the model two independent, mutually-reinforcing
// pointers at the same correct behavior for this exact failure shape.
const CHART_TOOL_PATTERN = /\bpie chart\b|\bpie graph\b|\bdonut\b|\bdoughnut\b|\bline chart\b|\bline graph\b|\bbar chart\b|\bbar graph\b|\bfew (?:different )?charts\b|\bmultiple charts\b|\bseveral charts\b/i;

export function detectChartToolPhrase(message: string): boolean {
  return CHART_TOOL_PATTERN.test(message);
}

// Hint text is not shipped in this distribution; provide your own (see systemPrompt/core/hints.ts).
export const CHART_TOOL_HINT = "";

// Hint text is not shipped in this distribution; provide your own (see systemPrompt/core/hints.ts).
export const CORRELATION_QUESTION_HINT = "";

// "export the sales register" / "download the customer list" / "get me a
// PDF of all quotations" — EXPLICIT file-download intent, needing
// report.generate (modules/reports/index.ts) instead of a plain *.list or
// *.report.* call, so raw rows never land in this conversation's context
// (see reportGenerator.ts's doc comment for why: a full/exported dataset
// can be thousands of rows, expensive and slow to push through an LLM,
// and — the real reason — customer data has no business transiting
// through the LLM at that volume when a file is what was actually asked
// for).
//
// Confirmed live 2026-08-17, real user correction, NOT a hypothetical:
// this used to also match bare "all"/"full"/"entire"/"complete"/"every"
// — so "give me all quotations" (a completely ordinary list request,
// wanting the normal 25-row-page table exactly like every other list
// question) was being redirected AWAY from quotation.list entirely,
// replacing the interactive paginated table with a PDF-link-only reply.
// That's backwards: normal pagination (25 rows, page-wise, "show me
// more") must keep working exactly as it always did — analytics.
// aggregate/chart.build/every other tool stays fully available and
// un-shadowed — and the full-dataset PDF is an ADDITIONAL option
// layered on top (see buildResponse()'s reportPdfStep, added as a
// next_step alongside the normal table), never a replacement for it.
// This hint now only fires on unambiguous file-intent words
// ("export"/"download"/"pdf") — the ones nobody uses to ask for an
// ordinary list.
//
// Still deliberately does NOT match bare "report" alone, same reasoning
// as before: "show me the profit and loss REPORT for this month" stays
// on the existing *.report.* tools (reportModuleFactory) for the common
// case — a single month's P&L is compact and useful directly in chat.
const FULL_REPORT_PATTERN = /\bexport\b|\bdownload\b|\bpdf\b/i;

export function detectFullReportPhrase(message: string): boolean {
  return FULL_REPORT_PATTERN.test(message);
}

// Hint text is not shipped in this distribution; provide your own (see systemPrompt/core/hints.ts).
export const FULL_REPORT_HINT = "";
