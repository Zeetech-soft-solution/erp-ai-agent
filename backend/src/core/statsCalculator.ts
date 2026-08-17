/**
 * Pure array-in, number-out math — no ERPNext, no entity, no fetch, no
 * credential. Shared by two callers with different jobs:
 *  - erpnextConnector.ts's aggregate() fetches real rows for one entity
 *    then reduces them with these same functions.
 *  - modules/analytics/index.ts's analytics.calculate tool (below) lets
 *    the model compute a derived number directly over values it ALREADY
 *    has in context — e.g. combining two separate analytics.aggregate
 *    results ({sum: period A}, {sum: period B}) into one growth-rate
 *    number — without a second ERPNext round trip and without doing the
 *    arithmetic itself (the same "never trust the model's own mental
 *    math over more than a couple of numbers" discipline as every other
 *    tool in analytics/, just for numbers it's holding rather than rows
 *    it still needs to fetch).
 */

export function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Population variance (divides by N, not N-1) — callers pass a full
// census of whatever set they're describing, not a sample used to infer
// a larger unseen population, so the population formula is correct.
export function variance(nums: number[]): number {
  const m = mean(nums);
  return nums.reduce((acc, n) => acc + (n - m) ** 2, 0) / nums.length;
}

export function stddev(nums: number[]): number {
  return Math.sqrt(variance(nums));
}

// (to - from) / |from| as a percentage — the standard "growth vs prior
// period" definition. from === 0 has no meaningful percentage (division
// by zero) — callers must handle that themselves rather than get back a
// silently wrong Infinity/NaN.
export function growthPercent(from: number, to: number): number {
  if (from === 0) throw new Error('growth cannot be computed when the "from" value is 0 (division by zero) — report the raw before/after values instead of a percentage');
  return ((to - from) / Math.abs(from)) * 100;
}

// Pearson correlation coefficient — the standard measure of linear
// correlation between two paired series (r in [-1, 1]; +1 = perfect
// positive linear relationship, -1 = perfect negative, 0 = none). This
// is THE standard formula for this, not a design choice — nothing
// bespoke here, same reasoning as growthPercent being the standard
// definition of period-over-period growth. xs/ys must be the SAME
// length and paired index-by-index (e.g. xs[i]/ys[i] both come from the
// same record) — an unequal-length or shuffled pairing produces a
// meaningless number, so both are rejected rather than silently
// truncated/zipped.
export function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length) {
    throw new Error(`pearsonCorrelation requires paired series of equal length — got ${xs.length} and ${ys.length}`);
  }
  if (xs.length < 2) {
    throw new Error("pearsonCorrelation needs at least 2 paired points to be meaningful");
  }
  const sx = stddev(xs);
  const sy = stddev(ys);
  if (sx === 0 || sy === 0) {
    throw new Error("pearsonCorrelation is undefined when one series has zero variation (every value identical) — there is nothing to correlate against");
  }
  const mx = mean(xs);
  const my = mean(ys);
  const covariance = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0) / xs.length;
  return covariance / (sx * sy);
}

export type StatsOp = "sum" | "avg" | "median" | "min" | "max" | "variance" | "stddev";

export function computeStatsOp(op: StatsOp, nums: number[]): number {
  switch (op) {
    case "sum": return nums.reduce((a, b) => a + b, 0);
    case "avg": return mean(nums);
    case "median": return median(nums);
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
    case "variance": return variance(nums);
    case "stddev": return stddev(nums);
  }
}
