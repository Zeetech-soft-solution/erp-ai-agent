/**
 * Pure shaping/validation for the chart.build tool (modules/chart) — same
 * discipline as statsCalculator.ts: this file does the deterministic work
 * a chart needs (percentage-of-total math, "too many slices" collapsing,
 * color assignment) so neither the model nor the renderer has to guess at
 * it. Zero ERPNext round-trip, zero credential — chart.build only ever
 * shapes numbers the caller already fetched (via analytics.aggregate/
 * calculate/correlate or an entity's own list/aggregate tool), exactly
 * the same "never invent it, only shape what's already real" contract as
 * analytics.calculate/correlate.
 *
 * Color choices below follow the project's dataviz skill: an 8-hue
 * categorical order already validated (fixed hue anchors, CVD-safe
 * adjacent pairs, ≥3:1 contrast with a legend as the relief channel for
 * the few slots that dip below it) — see the skill's palette.md for the
 * validation numbers. A lone series keeps the app's own existing
 * --accent teal instead (visual continuity with the pre-existing
 * auto-rendered bar chart; a single series needs no legend, so identity
 * doesn't need the categorical order at all — see the skill's
 * color-formula.md, "nominal categorical" with N=1).
 */

export type ChartType = "bar" | "line" | "pie" | "donut";

export interface ChartSeriesInput {
  name: string;
  values: number[];
}

export interface ChartSeriesSpec {
  name: string;
  values: number[];
  color: string;
}

export interface ChartSliceSpec {
  label: string;
  value: number;
  percentage: number;
  color: string;
}

export interface ChartSpec {
  chartType: ChartType;
  title: string;
  labels: string[]; // bar/line only — pie/donut carry their labels on each slice instead
  series?: ChartSeriesSpec[]; // bar/line only
  slices?: ChartSliceSpec[]; // pie/donut only
}

const CHART_TYPES: ChartType[] = ["bar", "line", "pie", "donut"];

// The dataviz skill's validated default categorical order (8 hues, fixed
// order, light-mode hexes — this app has no dark theme). Assigned by
// FIXED SLOT, never re-sorted by value, so a color always means the same
// identity across re-renders (color-formula.md's "color follows the
// entity, never its rank").
const CATEGORICAL_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
// Deliberately NOT a categorical slot — an "Other" bucket is a collapse
// artifact, not a real distinct identity, so it gets the chrome's own
// muted-ink gray rather than implying it's just another category.
const OTHER_SLICE_COLOR = "#898781";
// This app's own --accent (styles.css) — reused here so a single-series
// bar/line chart still matches today's existing auto-rendered bar chart.
const SINGLE_SERIES_COLOR = "#2F6F5E";
// dataviz skill's choosing-a-form.md: "More than ~7 classes that all
// carry meaning -> a table (or table + chart), not more colors."
const MAX_PIE_SLICES = 7;

function assertFiniteNumbers(values: number[], label: string): number[] {
  const nums = values.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) {
    throw new Error(`${label} has a non-numeric value — every value must be a real, already-fetched number, never estimated.`);
  }
  return nums;
}

/**
 * Builds and validates a ChartSpec from already-fetched numbers. Never
 * calls out to ERPNext and never computes anything the caller didn't
 * already provide except: percentage-of-total for pie/donut slices (pure
 * arithmetic over the caller's own values, same "the model never sums/
 * divides itself" reasoning as analytics.percentage) and deterministic
 * "Other" collapsing past MAX_PIE_SLICES.
 */
export function buildChartSpec(args: any): ChartSpec {
  const type = String(args?.type || "").toLowerCase() as ChartType;
  if (!CHART_TYPES.includes(type)) {
    throw new Error(`"type" must be one of ${CHART_TYPES.map((t) => `"${t}"`).join(", ")} — got "${args?.type}"`);
  }

  const title = typeof args?.title === "string" ? args.title.trim() : "";
  if (!title) {
    throw new Error('"title" is required — a short label describing what this chart shows (e.g. "Sales by Region").');
  }

  const labels: string[] = Array.isArray(args?.labels) ? args.labels.map((l: any) => String(l)) : [];
  if (!labels.length) {
    throw new Error('"labels" must be a non-empty array — the category/period names, one per data point.');
  }

  const seriesInput: ChartSeriesInput[] = Array.isArray(args?.series) ? args.series : [];
  if (!seriesInput.length) {
    throw new Error(
      '"series" must be a non-empty array of {name, values} — fetch the real numbers first (analytics.aggregate/' +
        "calculate/correlate, or an entity's own list/aggregate tool), never invent them here."
    );
  }

  const normalizedSeries: { name: string; values: number[] }[] = seriesInput.map((s) => {
    const name = typeof s?.name === "string" ? s.name.trim() : "";
    if (!name) throw new Error('Every series needs a non-empty "name".');
    const values = Array.isArray(s?.values) ? assertFiniteNumbers(s.values, `Series "${name}"`) : [];
    if (values.length !== labels.length) {
      throw new Error(
        `Series "${name}" has ${values.length} value(s) but "labels" has ${labels.length} — every series needs ` +
          "exactly one value per label, in the same order."
      );
    }
    return { name, values };
  });

  if (type === "pie" || type === "donut") {
    if (normalizedSeries.length !== 1) {
      throw new Error(
        `A ${type} chart takes exactly ONE series (its values ARE the slices) — got ${normalizedSeries.length}. ` +
          `Call chart.build once per ${type} you want to show.`
      );
    }
    const values = normalizedSeries[0].values;
    if (values.some((n) => n < 0)) {
      throw new Error(`A ${type} chart's values represent parts of a whole and can't be negative.`);
    }
    const total = values.reduce((sum, n) => sum + n, 0);
    if (total <= 0) {
      throw new Error(`A ${type} chart needs at least one positive value — every slice came to 0.`);
    }

    let entries: { label: string; value: number; isOther?: boolean }[] = labels
      .map((label, i) => ({ label, value: values[i] }))
      .sort((a, b) => b.value - a.value);

    if (entries.length > MAX_PIE_SLICES) {
      const kept = entries.slice(0, MAX_PIE_SLICES - 1);
      const rest = entries.slice(MAX_PIE_SLICES - 1);
      const otherValue = rest.reduce((sum, e) => sum + e.value, 0);
      entries = [...kept, { label: "Other", value: otherValue, isOther: true }];
    }

    const slices: ChartSliceSpec[] = entries.map((e, i) => ({
      label: e.label,
      value: e.value,
      percentage: Math.round((e.value / total) * 1000) / 10,
      color: e.isOther ? OTHER_SLICE_COLOR : CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
    }));

    return { chartType: type, title, labels: [], slices };
  }

  // bar/line — label order is caller-controlled (a trend's period
  // sequence matters), never re-sorted here.
  const series: ChartSeriesSpec[] = normalizedSeries.map((s, i) => ({
    name: s.name,
    values: s.values,
    color: normalizedSeries.length === 1 ? SINGLE_SERIES_COLOR : CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
  }));

  return { chartType: type, title, labels, series };
}
