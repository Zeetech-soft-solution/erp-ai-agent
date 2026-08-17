import { MCPModule } from "../../core/types";
import { systemConnector } from "../../config/system.config";
import { ENTITY_CONFIGS } from "../../config/entities.config";
import { computeStatsOp, growthPercent, pearsonCorrelation, StatsOp } from "../../core/statsCalculator";

/**
 * Calculator-as-a-tool — same discipline as Toolformer/ReAct-style
 * tool-augmented LLMs: arithmetic over real rows (sums, averages,
 * ratios) is NEVER something the model does itself by eyeballing rows
 * pulled into its own context (unreliable past a handful of rows, and
 * wasteful of context to boot). Every number these two tools return is
 * computed server-side in ErpNextConnector.aggregate() — the model
 * only ever calls the tool and reports back what it returned.
 *
 * Generic across every entity in entities.config.ts (not one hand-
 * written tool per module) — the same reasoning entityModuleFactory
 * already applies to list/get/create/update's filters. Access control
 * is NOT a separate allow-list here: aggregate() calls through to
 * ErpNextConnector using the caller's own UserCredential, so ERPNext's
 * own DocPerm decides what rows exist to aggregate over, exactly as it
 * would for that same person calling <entity>.list — a role that can't
 * list Purchase Orders can't get an average Purchase Order value
 * either. roles.policy.ts's "analytics.aggregate"/"analytics.percentage"
 * grants are only about whether a role sees the feature at all, not a
 * second data boundary.
 */
// Confirmed live 2026-08-15: "show me a bar chart of leads broken down by
// status" made the model retry entityKey:"lead" against analytics.aggregate
// several times across two separate turns, in every argument shape it
// could think of — it was the exactly correct guess every time — and
// every single one was rejected as "Unknown entity". Root cause: "lead"
// is deliberately hand-written in modules/crm/index.ts (crm.list_leads/
// get_lead/create_lead/update_lead_status) instead of going through
// entityModuleFactory, so it was never added to ENTITY_CONFIGS — but
// erpnextConnector.ts's aggregate()/list()/get() resolve purely off
// ERPNEXT_ENTITY_MAP (entityMaps/crm.ts's own "lead" mapping — the exact
// same mapping crm.list_leads itself already calls through). The
// UserCredential-scoped access-boundary reasoning in this file's own top
// comment applies unchanged: this was purely a missing-from-the-allowlist
// gap in THIS module, never a real capability or permission limit — every
// live guess at entityKey:"lead" was correct, the tool just kept refusing
// it. Verified this is the ONLY such gap (grepped every hand-written
// module's own systemConnector.* calls against ENTITY_CONFIGS —
// "customer" and "opportunity" are also hand-written-used but were
// already registered; only "lead" was orphaned).
const VALID_ENTITY_KEYS = new Set([...ENTITY_CONFIGS.map((c) => c.entityKey), "lead"]);

function assertKnownEntity(entityKey: string) {
  if (!VALID_ENTITY_KEYS.has(entityKey)) {
    throw new Error(`Unknown entity "${entityKey}" — see the entityKey list in each list/get tool's description`);
  }
}

/**
 * Confirmed live 2026-08-11: "compare this month's pass rate to last
 * month's" called analytics.percentage twice, but the date filter never
 * made it onto BOTH "filters" (numerator) and "ofFilters" (denominator)
 * consistently — call 1 applied no date to either side (all-time
 * matched=1227 / total=1290); call 2 applied a date only to ofFilters
 * (all-time matched=1227 / last-month total=66), producing a
 * mathematically impossible 1859.1%. By this tool's own definition
 * "filters" must always be a refinement of "ofFilters" (the fraction of
 * the base population that ALSO matches the narrower condition) —
 * matched can never legitimately exceed total. Rather than let a
 * nonsensical percentage reach the user as if it were real, this is
 * exported so the handler below can throw a clear, actionable error the
 * tool-calling loop surfaces back to the model — forcing a corrected
 * retry with consistent scoping instead of reporting garbage as fact.
 */
export function validatePercentageCounts(matched: number, total: number): void {
  if (total > 0 && matched > total) {
    throw new Error(
      `analytics.percentage got an impossible result (matched=${matched} > total=${total}). "filters" (the ` +
        `numerator) must be a refinement of "ofFilters" (the denominator) — the same scoping condition (e.g. a ` +
        `date range) has to appear in BOTH, not just one side. Re-check that any period filter (e.g. {"date":` +
        `{"op":"relative","value":"..."}}) is present in both filters and ofFilters, using the SAME value.`
    );
  }
}

/**
 * Confirmed live 2026-08-17 (business-prompt regression sweep): "compare
 * quality inspection pass rate this month against last month" burned its
 * entire tool-iteration budget on validatePercentageCounts' error above and
 * never recovered — every retry sent filters:{"status":"Accepted"} with the
 * period condition ONLY in ofFilters (e.g. {"date":{"op":"relative",
 * "value":"this_month"}}), got matched=1242 (the real ALL-TIME count,
 * unscoped) vs total=36 (correctly month-scoped), and the model kept
 * mutating ofFilters on each retry without ever also adding the date
 * condition to filters, despite the error message saying exactly that.
 * Same LLM-compliance-ceiling problem as everywhere else in this file —
 * telling the model what to fix doesn't reliably make it fix it.
 *
 * Since "filters is a refinement of ofFilters" is genuinely what this tool
 * always means (see its own description) regardless of which side the
 * caller happened to put a shared scoping condition on, this is safe to
 * enforce structurally instead of just validating after the fact: any
 * top-level key present in ofFilters but ABSENT from filters is exactly
 * the situation the numerator was supposed to inherit — no different from
 * "% of Sales Orders that are Open, of Sales Orders this month" needing
 * the month scope on both sides. Never overwrites a key the caller
 * genuinely set differently in filters (that's a real, deliberate
 * mismatch — e.g. comparing this month's Accepted rate against last
 * month's total would be a genuine caller bug, still worth catching by
 * validatePercentageCounts below, not something to silently paper over).
 */
export function reconcilePercentageFilters(filters: Record<string, any> | undefined, ofFilters: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!ofFilters) return filters;
  const missingFromFilters = Object.keys(ofFilters).filter((k) => !(filters && k in filters));
  if (missingFromFilters.length === 0) return filters;
  const merged = { ...(filters || {}) };
  for (const k of missingFromFilters) merged[k] = ofFilters[k];
  return merged;
}

export const analyticsModule: MCPModule = {
  name: "analytics",
  description: "Server-side calculations (sum/average/count/min/max, percentages) over ERP records — never estimate these yourself, always call these tools",
  tools: [
    {
      name: "analytics.aggregate",
      description:
        "Compute SUM, AVG, COUNT, MIN, or MAX of a numeric field across records of one entity, filtered the same way " +
        "<entity>.list is (see that tool's own description for the filter object shape). Optionally break the result " +
        "down by another field with groupBy (e.g. average opportunity amount BY territory). Always use this instead " +
        "of listing rows and computing the number yourself — it is exact, this tool's own arithmetic is not.\n\n" +
        "EXAMPLES:\n" +
        '  • "What\'s our total open opportunity value this year?" → {"entityKey":"opportunity","field":"amount",' +
        '"op":"sum","filters":{"date":{"op":"relative","value":"this_year"}}} → read the result\'s overall.value.\n' +
        '  • "How many open leads do we have?" → {"entityKey":"lead","op":"count",' +
        '"filters":{"status":"Open"}} (no "field" needed for op:"count").\n' +
        '  • "Break down opportunity value by territory" → {"entityKey":"opportunity","field":"amount",' +
        '"op":"sum","groupBy":"territory"} → one call, read the result\'s "groups" array (each ' +
        '{"key":..., "value":..., "count":...}), never one call per territory.\n' +
        "This tool is exact and complete no matter how large the matching population is — even over a multi-year " +
        "date range spanning tens of thousands of records — it computes the real total server-side (chunking the " +
        "query internally when needed) rather than sampling or capping silently; you never need to narrow a date " +
        "range just to keep this tool from timing out or under-counting.",
      module: "analytics",
      parameters: {
        type: "object",
        properties: {
          entityKey: { type: "string", description: `One of: ${[...VALID_ENTITY_KEYS].join(", ")}` },
          field: { type: "string", description: 'A numeric canonical field on that entity (e.g. "total", "amount"). Not required when op is "count".' },
          op: { type: "string", enum: ["sum", "avg", "count", "min", "max"] },
          filters: { type: "object", description: "Same shape as <entity>.list's filters parameter." },
          groupBy: { type: "string", description: "Optional canonical field to break the result down by, instead of one overall number." },
        },
        required: ["entityKey", "op"],
      },
      handler: async (args, session) => {
        assertKnownEntity(args.entityKey);
        if (args.op !== "count" && !args.field) {
          throw new Error(`"field" is required for op "${args.op}" (only "count" can omit it)`);
        }
        return systemConnector.aggregate(args.entityKey, session.credential, {
          field: args.field,
          op: args.op,
          filters: args.filters,
          groupBy: args.groupBy,
        });
      },
    },
    {
      name: "analytics.percentage",
      description:
        'What share of records match a condition, e.g. "what percentage of Issues are High priority" or "what % of ' +
        'Sales Orders are still open". "filters" is the matching condition (the numerator); "ofFilters" narrows the ' +
        "base population to compare against (the denominator) — omit ofFilters to mean \"of all records of this " +
        'entity\". Never compute this yourself by dividing two separate .list/.aggregate results in your head.',
      module: "analytics",
      parameters: {
        type: "object",
        properties: {
          entityKey: { type: "string", description: `One of: ${[...VALID_ENTITY_KEYS].join(", ")}` },
          filters: { type: "object", description: "The matching condition to measure (the numerator) — same shape as <entity>.list's filters." },
          ofFilters: {
            type: "object",
            description:
              "Optional: narrows the base population (the denominator). Omit to mean all records of this entity. " +
              "If \"filters\" includes a date/period condition (e.g. comparing a rate for a specific month), the " +
              "SAME date condition must ALSO be in ofFilters — filters is always a refinement of ofFilters, so a " +
              "date scope on one side without the other produces a mismatched, meaningless percentage.",
          },
        },
        required: ["entityKey", "filters"],
      },
      handler: async (args, session) => {
        assertKnownEntity(args.entityKey);
        const reconciledFilters = reconcilePercentageFilters(args.filters, args.ofFilters);
        const [matched, total] = await Promise.all([
          systemConnector.aggregate(args.entityKey, session.credential, { op: "count", filters: reconciledFilters }),
          systemConnector.aggregate(args.entityKey, session.credential, { op: "count", filters: args.ofFilters }),
        ]);
        validatePercentageCounts(matched.overall.count, total.overall.count);
        return {
          percentage: total.overall.count > 0 ? Math.round((matched.overall.count / total.overall.count) * 1000) / 10 : null,
          matched: matched.overall.count,
          total: total.overall.count,
        };
      },
    },
    {
      // Confirmed 2026-08-14: analytics.aggregate always re-fetches from
      // ERPNext for one entity — there was no way to compute a derived
      // number over values the model ALREADY has (e.g. combining two
      // separate aggregate calls' results — "this month's total" and
      // "last month's total" — into one real growth percentage) without
      // either a wasteful third fetch or the model doing the subtraction/
      // division itself. Pure math, no ERPNext round trip, no entity, no
      // credential check needed (it never touches protected data — the
      // caller already had these numbers) — same shared statsCalculator.ts
      // functions erpnextConnector.ts's aggregate() itself now uses, so
      // there is exactly one implementation of this math, not two that
      // could quietly drift apart.
      name: "analytics.calculate",
      description:
        'The second half of any KPI/dashboard/trend question — analytics.aggregate gets you the real numbers, ' +
        "analytics.calculate turns several of them into the derived metric someone actually asked for. Never do " +
        'this arithmetic yourself in prose (e.g. never write "that\'s roughly a 12% increase" by eyeballing two ' +
        'numbers) — always call this tool for it. ops: "sum"/"avg"/"median"/"min"/"max"/"variance"/"stddev" (each ' +
        'over "values", 1 or more numbers) — or "growth" (exactly 2 numbers, [before, after], returns real % change). ' +
        "\n\nADVANCED USAGE — chaining with analytics.aggregate for a real dashboard/trend (see DASHBOARD_QUESTION_HINT):\n" +
        '  • Trend over N periods: call analytics.aggregate once PER period (op:"sum", same date-scoped filters, ' +
        'one call per month/week) to collect N real totals, then optionally call this tool with those N values and ' +
        'op:"avg" (typical period size) or op:"variance"/"stddev" (how volatile the trend is) — never estimate ' +
        "either by scanning the raw numbers yourself.\n" +
        '  • Growth vs. a prior period: two analytics.aggregate calls (this period, prior period) → one ' +
        'analytics.calculate call with op:"growth" and values:[priorTotal, thisTotal].\n' +
        '  • "Typical deal size" for a KPI card: analytics.aggregate op:"avg" already does this in one call — only ' +
        "reach for analytics.calculate when you need to combine MULTIPLE already-fetched numbers, not for a single " +
        "field average over one filter (that's aggregate's own op:\"avg\", no second call needed).\n" +
        "  • Never call this on numbers you haven't actually fetched yet — get the real values from the entity's " +
        "own list/aggregate tool first; this tool only computes over numbers already in hand, it does not fetch.",
      module: "analytics",
      parameters: {
        type: "object",
        properties: {
          values: {
            type: "array",
            items: { type: "number" },
            description: 'The numbers to compute over. For op:"growth" this must be exactly [before, after].',
          },
          op: { type: "string", enum: ["sum", "avg", "median", "min", "max", "variance", "stddev", "growth"] },
        },
        required: ["values", "op"],
      },
      handler: async (args) => {
        const values: number[] = Array.isArray(args.values) ? args.values.map(Number) : [];
        if (values.some((n) => Number.isNaN(n))) {
          throw new Error('"values" must be an array of real numbers — at least one entry did not parse as a number');
        }
        if (values.length === 0) {
          throw new Error('"values" is empty — fetch the real numbers first (e.g. via analytics.aggregate) before calling analytics.calculate');
        }
        if (args.op === "growth") {
          if (values.length !== 2) {
            throw new Error('op:"growth" requires exactly 2 values: [before, after] — got ' + values.length);
          }
          return { op: "growth", from: values[0], to: values[1], percentage: Math.round(growthPercent(values[0], values[1]) * 100) / 100 };
        }
        return { op: args.op, count: values.length, value: computeStatsOp(args.op as StatsOp, values) };
      },
    },
    {
      // Same Pattern-A design as analytics.calculate — a typed, audited,
      // role-gated tool rather than a general code-execution sandbox
      // (the OTHER standard pattern for this, used by e.g. ChatGPT Code
      // Interpreter — deliberately not adopted here since this app's
      // whole security model is built on exact-name tool gating; a
      // correlation coefficient has one standard formula anyway, so
      // there's nothing a sandbox would buy over one more typed tool).
      // Pure math, no ERPNext round trip — same statsCalculator.ts this
      // whole module already shares.
      name: "analytics.correlate",
      description:
        "Compute the Pearson correlation coefficient (the standard measure of linear correlation, -1 to +1) between " +
        "two PAIRED series of numbers you already have — e.g. deal size vs. days-to-close, pulled from the same set " +
        'of records via that entity\'s own .list tool (fields:[...] both on the same records), then pass the two ' +
        'columns as valuesA/valuesB here, index-aligned (valuesA[i] and valuesB[i] must be from the SAME record). ' +
        "Never estimate or describe a correlation yourself by eyeballing two lists — always call this tool for the " +
        "real number. Returns near +1 (strong positive), near -1 (strong negative), or near 0 (no linear " +
        "relationship) — do not overstate a weak coefficient (e.g. 0.2) as a strong relationship in your reply. " +
        "Requires at least 2 paired points, and both series must have some real variation (not all-identical values).",
      module: "analytics",
      parameters: {
        type: "object",
        properties: {
          valuesA: { type: "array", items: { type: "number" }, description: "First series — same length and record order as valuesB." },
          valuesB: { type: "array", items: { type: "number" }, description: "Second series — same length and record order as valuesA." },
        },
        required: ["valuesA", "valuesB"],
      },
      handler: async (args) => {
        const valuesA: number[] = Array.isArray(args.valuesA) ? args.valuesA.map(Number) : [];
        const valuesB: number[] = Array.isArray(args.valuesB) ? args.valuesB.map(Number) : [];
        if (valuesA.some((n) => Number.isNaN(n)) || valuesB.some((n) => Number.isNaN(n))) {
          throw new Error('"valuesA"/"valuesB" must be arrays of real numbers — at least one entry did not parse as a number');
        }
        const coefficient = pearsonCorrelation(valuesA, valuesB);
        const magnitude = Math.abs(coefficient);
        const strength = magnitude >= 0.7 ? "strong" : magnitude >= 0.3 ? "moderate" : "weak";
        return {
          coefficient: Math.round(coefficient * 1000) / 1000,
          direction: coefficient > 0 ? "positive" : coefficient < 0 ? "negative" : "none",
          strength,
          pairCount: valuesA.length,
        };
      },
    },
  ],
};
