import { MCPModule } from "../../core/types";
import { buildChartSpec } from "../../core/chartSpecBuilder";
import { ANALYTICS_RULES } from "../../systemPrompt/core/analytics";
import { ANALYTICS_MODULE } from "../../systemPrompt/modules";

/**
 * Charting elevated to an explicit, composable tool (2026-08-14 session's
 * own TODO, picked up here) — before this, a chart was only ever a
 * passive side effect of DISPLAY_INTENT:{"render":"chart"} on a *.list
 * result, always exactly one bar-by-category shape, never something the
 * model could deliberately ask for by type. This tool is Pattern A, same
 * discipline as analytics.calculate/correlate: typed, audited, zero
 * ERPNext round-trip, zero code-execution sandbox — it only SHAPES
 * numbers the caller already fetched (via analytics.aggregate/calculate/
 * correlate, or an entity's own list/aggregate tool), it never invents or
 * re-fetches them. See core/chartSpecBuilder.ts for the actual shaping/
 * validation logic (kept separate and unit-testable on its own, same
 * split as every other module/logic pairing in this codebase).
 *
 * Composable: calling this more than once in the same turn (e.g. one
 * call for a trend line, one for a status breakdown pie) is a supported,
 * expected pattern — reasoningEngine.ts's tool loop collects every
 * chart.build result from the turn and renders them together as one
 * combined response, not just the last one. This is what makes a real
 * multi-chart "dashboard" reply possible without a separate composition
 * tool — see reasoningEngine.ts's chart.build handling for where that
 * combination actually happens.
 */
export const chartModule: MCPModule = {
  name: "chart",
  description: "Build charts from fetched data.",
  tools: [
    {
      // 2026-08-23, explicit user request: cut to a one-liner — the
      // sequencing rule (fetch via aggregate/calculate/correlate FIRST,
      // multi-chart composition, no DISPLAY_INTENT needed) is already in
      // ANALYTICS_RULES' own CHART WORKFLOWS section, sent every turn.
      name: "chart.build",
      description: `bar|line|pie|donut. Use AFTER aggregate/calculate/list. Multiple calls = multiple charts.
params: type, title, labels:[], series:[{name, values:[]}] (pie/donut=1 series)`,
      module: "utilities",
      // The CHART WORKFLOWS sequencing rule lives in ANALYTICS_RULES —
      // no longer sent every turn, so it rides in with this tool.
      promptRules: [ANALYTICS_RULES, ANALYTICS_MODULE],
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["bar", "line", "pie", "donut"] },
          title: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
          series: { type: "array", items: { type: "object", properties: { name: { type: "string" }, values: { type: "array", items: { type: "number" } } }, required: ["name", "values"] } },
        },
        required: ["type", "title", "labels", "series"],
      },
      handler: async (args) => buildChartSpec(args),
    },
  ],
};
