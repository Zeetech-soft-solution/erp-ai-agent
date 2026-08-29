import { MCPModule } from "../../core/types";
import { systemConnector } from "../../config/system.config";
import { ENTITY_CONFIGS } from "../../config/entities.config";
import { resolveEntityKey } from "../../core/entityUtils";
import { computeStatsOp, growthPercent, pearsonCorrelation, StatsOp } from "../../core/statsCalculator";
import { resolveLastNMonths } from "../../core/relativePeriods";
import { ANALYTICS_RULES } from "../../systemPrompt/core/analytics";
import { ANALYTICS_MODULE } from "../../systemPrompt/modules";

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
// same mapping crm.list_leads itself already calls through). Fixed here
// as an explicit `"lead"` addition below at the time. UPDATE 2026-08-19:
// a SECOND, separate "lead" orphan gap (same root cause, different
// consumer — the relay's own missing lead.list/lead.get tool
// registration, see config/modules/crm/entity/lead.ts's own doc comment)
// led to actually registering a real LEAD_ENTITY in ENTITY_CONFIGS, so
// the explicit `"lead"` addition below is now redundant (Set dedupes it
// harmlessly) — left in place rather than removed, since this module
// should never silently regress back to rejecting "lead" again if
// LEAD_ENTITY is ever renamed/removed from ENTITY_CONFIGS for some
// unrelated reason.
const VALID_ENTITY_KEYS = new Set([...ENTITY_CONFIGS.map((c) => c.entityKey), "lead"]);

// Real, live-found gap (2026-08-26, confirmed via real interaction_log
// traffic): a metric's own "name" is genuinely optional in this tool's
// schema (only "op" is required) — the model sometimes omits it, and
// without a fallback the merged row got a literal "undefined" key
// instead of a real one. Falls back to "<op>_<field>" (or just "<op>"
// for count, which has no field), de-duped against every other real or
// already-generated name in the same metrics array so two unnamed
// same-op-different-field metrics never collide. Same fallback shape
// modules/dataServer/index.ts's own uniqueImplicitMetricName already
// uses for the identical real gap on that separate tool — not shared
// code (these are two independent tools), same idea.
function resolveMetricNames(metrics: { name?: string; op: string; field?: string }[]): string[] {
  const taken = new Set(metrics.map((m) => m.name).filter(Boolean));
  return metrics.map((m) => {
    if (m.name) return m.name;
    const base = m.field ? `${m.op}_${m.field}` : m.op;
    let name = base;
    let n = 2;
    while (taken.has(name)) name = `${base}_${n++}`;
    taken.add(name);
    return name;
  });
}

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
  description: "Server-side calculations. Never estimate numbers yourself. Always call these tools.",
  tools: [
    {
      // 2026-08-23, explicit user request: description cut to a one-liner
      // — the real workflow (call shape, groupBy ranking, metrics,
      // min/max phrasing, recordId follow-up) is already in the always-on
      // ANALYTICS_RULES (systemPrompt/core/analytics.ts), sent every turn
      // regardless of which tools are narrowed in; repeating it here was
      // pure duplicate tokens. Full prior text (with every real live-bug
      // citation) is in this file's git history if a specific fact ever
      // needs restoring.
      //
      // 2026-08-23, later same night: the full entityKey list (spelled
      // out in this description below, previously) turned out to be a
      // real, structural false-positive magnet — matchToolsByDescription
      // does plain word-overlap scoring against name+description, so
      // enumerating ~75 entity names here made this tool match almost
      // any prompt mentioning ANY entity, regardless of real relevance
      // (confirmed live: matched on a plain "bring quotations" list
      // question). Removed the enumeration entirely rather than keep
      // trading accuracy for over-matching — the handler's own
      // assertKnownEntity() still accepts every real entity and throws a
      // clear, complete list on a wrong guess (a real, recoverable
      // error, not a silent failure), so the model doesn't need the full
      // list spelled out up front to use this tool correctly; same
      // reasoning generic <entity>.list tools already rely on (they
      // never enumerate cross-entity keys either).
      name: "analytics.aggregate",
      description: `SUM/AVG/COUNT/MIN/MAX on any real entity. Use groupBy for breakdown. metrics for multiple measures in one call.
        entityKey: same canonical entity key as that entity's own .list tool
        op: sum|avg|count|min|max
        field: numeric field (skip for count)
        filters: same as .list
        groupBy: field to break down; combine with groupByPeriod for a multi-series time chart such as status by month
        metrics: [{name, op, field, filters}] (requires groupBy)
        For a monthly trend (e.g. "last 6 months"), use groupByPeriod:"month" + periodField (the real date field, e.g. "posting_date") + periods (default 6) INSTEAD of groupBy — one call returns one real group per calendar month, never guess/compute date ranges yourself. metrics also works with groupByPeriod (one named value per month per metric) — op/field alone still works too for a single measure.
        For a chart, add chart:{type,title} (type: bar|line|pie|donut) alongside groupBy or groupByPeriod — the real fetched groups are built into the chart for you automatically, no separate chart.build call needed.`,
      module: "utilities",
      promptRules: [ANALYTICS_RULES, ANALYTICS_MODULE],
      parameters: {
        type: "object",
        properties: {
          entityKey: { type: "string" },
          field: { type: "string" },
          op: { type: "string", enum: ["sum", "avg", "count", "min", "max"] },
          filters: { type: "object" },
          groupBy: { type: "string" },
          metrics: { type: "array" },
          groupByPeriod: { type: "string", enum: ["month"] },
          periodField: { type: "string" },
          periods: { type: "number" },
          chart: {
            type: "object",
            properties: { type: { type: "string", enum: ["bar", "line", "pie", "donut"] }, title: { type: "string" } },
            required: ["type", "title"],
          },
        },
        required: ["entityKey"],
      },
      handler: async (args, session) => {
        // "invoice" -> sales_invoice etc. (config/entities.config.ts
        // ENTITY_ALIASES) before anything downstream sees it.
        if (typeof args.entityKey === "string") args.entityKey = resolveEntityKey(args.entityKey);
        assertKnownEntity(args.entityKey);
        // Real, live-found gap (2026-08-26): a genuine "monthly trend"
        // question ("last 6 months") had no reliable way to construct
        // itself — RELATIVE_PERIODS has nothing between last_month and
        // last_60_days, so the model rambled about "adjusting the date
        // range" and gave up rather than making 6 separate correctly-
        // scoped calls itself. Same "never ask the model to do date
        // arithmetic" philosophy as relativePeriods.ts itself: this
        // computes all N real calendar months server-side in ONE call,
        // one systemConnector.aggregate per month (each already exact/
        // chunked on its own), and merges them into the SAME {groups:
        // [{key,value,count}]} shape groupBy already produces — so it
        // flows through the exact same (now-unstripped, see this
        // module's own 2026-08-26 groupBy fix) real-data path chart.build
        // already expects, no separate rendering/stripping logic needed.
        if (args.groupByPeriod === "month") {
          if (!args.periodField) throw new Error('"periodField" is required when groupByPeriod is "month" — the real date field to bucket by (e.g. "posting_date")');
          const periods = Math.min(Math.max(Math.round(Number(args.periods) || 6), 1), 24);
          const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
          const months = resolveLastNMonths(todayIso, periods);

          if (args.groupBy) {
            if (args.op !== "count") throw new Error('A grouped time chart currently supports op count only; use metrics for separate measures');
            if (Array.isArray(args.metrics) && args.metrics.length) throw new Error('Use either groupBy for status series or metrics for separate measures, not both');
            const perMonth = await Promise.all(
              months.map((mo) =>
                systemConnector.aggregate(args.entityKey, session.credential, {
                  op: "count",
                  filters: { ...(args.filters || {}), [args.periodField]: { op: "between", value: [mo.start, mo.end] } },
                  groupBy: args.groupBy,
                })
              )
            );
            const seriesNames = new Set<string>();
            perMonth.forEach((result: any) => (result.groups || []).forEach((group: any) => seriesNames.add(String(group.key))));
            const names = [...seriesNames];
            return {
              groups: months.map((mo, monthIndex) => {
                const values = new Map<string, number>((perMonth[monthIndex].groups || []).map((group: any) => [String(group.key), Number(group.value || 0)]));
                const row: Record<string, any> = { key: mo.label };
                names.forEach((name) => (row[name] = values.get(name) || 0));
                return row;
              }),
            };
          }

          // Real, live-found gap (2026-08-26, confirmed via real
          // interaction_log traffic): groupByPeriod only ever supported a
          // single top-level op/field — a real "Total Sales per month"
          // call naturally reaches for the SAME metrics:[{name,op,field}]
          // shape the plain groupBy mode already accepts (and this
          // module's own tool description already advertises for
          // groupBy), and got rejected here with a confusing "field is
          // required for op undefined" instead. Same real per-month
          // aggregate calls as the single-metric path below, just one
          // per named metric per month, merged into one row per month —
          // mirrors the plain groupBy metrics-merge further down.
          if (Array.isArray(args.metrics) && args.metrics.length) {
            const names = resolveMetricNames(args.metrics);
            const perMonth = await Promise.all(
              months.map((mo) =>
                Promise.all(
                  args.metrics.map((m: any) => {
                    if (m.op !== "count" && !m.field) throw new Error(`metric "${m.name || m.op}": "field" is required for op "${m.op}" (only "count" can omit it)`);
                    return systemConnector.aggregate(args.entityKey, session.credential, {
                      field: m.field,
                      op: m.op,
                      filters: { ...(args.filters || {}), ...(m.filters || {}), [args.periodField]: { op: "between", value: [mo.start, mo.end] } },
                    });
                  })
                )
              )
            );
            return {
              groups: months.map((mo, i) => {
                const row: Record<string, any> = { key: mo.label };
                perMonth[i].forEach((r: any, j: number) => (row[names[j]] = r.overall.value));
                return row;
              }),
            };
          }

          if (args.op !== "count" && !args.field) throw new Error(`"field" is required for op "${args.op}" (only "count" can omit it)`);
          const perMonth = await Promise.all(
            months.map((mo) =>
              systemConnector.aggregate(args.entityKey, session.credential, {
                field: args.field,
                op: args.op,
                filters: { ...(args.filters || {}), [args.periodField]: { op: "between", value: [mo.start, mo.end] } },
              })
            )
          );
          const totalCount = perMonth.reduce((sum: number, r: any) => sum + r.overall.count, 0);
          const overallValue =
            args.op === "sum" || args.op === "count"
              ? perMonth.reduce((sum: number, r: any) => sum + r.overall.value, 0)
              : args.op === "min"
              ? Math.min(...perMonth.map((r: any) => r.overall.value))
              : args.op === "max"
              ? Math.max(...perMonth.map((r: any) => r.overall.value))
              : totalCount > 0 // avg: real weighted average across months, not an average-of-averages
              ? perMonth.reduce((sum: number, r: any) => sum + r.overall.value * r.overall.count, 0) / totalCount
              : 0;
          return {
            overall: { value: overallValue, count: totalCount },
            groups: months.map((mo, i) => ({ key: mo.label, value: (perMonth[i] as any).overall.value, count: (perMonth[i] as any).overall.count })),
          };
        }
        if (Array.isArray(args.metrics) && args.metrics.length) {
          if (!args.groupBy) throw new Error('"groupBy" is required when using "metrics"');
          const names = resolveMetricNames(args.metrics);
          const results = await Promise.all(
            args.metrics.map((m: any) => {
              if (m.op !== "count" && !m.field) throw new Error(`metric "${m.name || m.op}": "field" is required for op "${m.op}" (only "count" can omit it)`);
              return systemConnector.aggregate(args.entityKey, session.credential, { field: m.field, op: m.op, filters: m.filters, groupBy: args.groupBy });
            })
          );
          // Merge every metric's own real groups into one combined
          // per-key row — the union of every group key any metric saw
          // (a customer with zero paid invoices still needs a real "0"
          // for paid_count, not a missing row), each metric contributing
          // its own named value, everything else defaulting to 0.
          const merged = new Map<string, Record<string, any>>();
          results.forEach((result: any, i: number) => {
            const name = names[i];
            for (const g of result.groups || []) {
              const row = merged.get(g.key) || { key: g.key };
              row[name] = g.value;
              merged.set(g.key, row);
            }
          });
          const groups = Array.from(merged.values()).map((row) => {
            for (const n of names) if (!(n in row)) row[n] = 0;
            return row;
          });
          groups.sort((a, b) => (b[names[0]] || 0) - (a[names[0]] || 0));
          return { groups };
        }
        if (args.op !== "count" && !args.field) {
          throw new Error(`"field" is required for op "${args.op}" (only "count" can omit it)`);
        }
        if (!args.op) throw new Error('"op" is required (or use "metrics" for several measures at once)');
        return systemConnector.aggregate(args.entityKey, session.credential, {
          field: args.field,
          op: args.op,
          filters: args.filters,
          groupBy: args.groupBy,
        });
      },
    },
    {
      // ofFilters' old description warned the model to repeat a date
      // condition on both sides — no longer load-bearing prompt text:
      // reconcilePercentageFilters() (below, called unconditionally in
      // the handler) already auto-merges any key present in ofFilters
      // but missing from filters, so the exact mistake that warning
      // existed for is now fixed structurally, not just requested.
      name: "analytics.percentage",
      description: `Percentage of records matching condition. filters=numerator, ofFilters=denominator (optional).`,
      module: "utilities",
      promptRules: [ANALYTICS_RULES, ANALYTICS_MODULE],
      parameters: {
        type: "object",
        properties: { entityKey: { type: "string" }, filters: { type: "object" }, ofFilters: { type: "object" } },
        required: ["entityKey", "filters"],
      },
      handler: async (args, session) => {
        // "invoice" -> sales_invoice etc. (config/entities.config.ts
        // ENTITY_ALIASES) before anything downstream sees it.
        if (typeof args.entityKey === "string") args.entityKey = resolveEntityKey(args.entityKey);
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
      description: `Derived metrics over values you already have. ops: sum|avg|median|min|max|variance|stddev|growth (growth = [before,after]).`,
      module: "utilities",
      promptRules: [ANALYTICS_RULES, ANALYTICS_MODULE],
      parameters: {
        type: "object",
        properties: { values: { type: "array", items: { type: "number" } }, op: { type: "string", enum: ["sum", "avg", "median", "min", "max", "variance", "stddev", "growth"] } },
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
      description: `Pearson correlation between two series. Returns {coefficient, direction, strength, pairCount}.`,
      module: "utilities",
      promptRules: [ANALYTICS_RULES, ANALYTICS_MODULE],
      parameters: {
        type: "object",
        properties: { valuesA: { type: "array", items: { type: "number" } }, valuesB: { type: "array", items: { type: "number" } } },
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
