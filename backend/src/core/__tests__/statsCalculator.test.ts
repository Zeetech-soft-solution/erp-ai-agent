import { mean, median, variance, stddev, growthPercent, computeStatsOp, pearsonCorrelation } from "../statsCalculator";

// Confirmed 2026-08-14: analytics.aggregate only had sum/avg/count/min/max
// — no exact way to answer "median deal size" or "how volatile is our
// revenue" without the model estimating from a raw list. These pure
// functions back both erpnextConnector.ts's aggregate() (real ERPNext
// rows) and the analytics.calculate tool (values the model already has)
// — one implementation, tested once, used both places.
describe("mean", () => {
  it("computes the arithmetic mean", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([10, 20])).toBe(15);
  });
});

describe("median", () => {
  it("returns the middle value for an odd-length array", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("averages the two middle values for an even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("does not mutate the input array (sorts a copy)", () => {
    const input = [5, 1, 3];
    median(input);
    expect(input).toEqual([5, 1, 3]);
  });
});

describe("variance/stddev", () => {
  it("computes population variance (divides by N, not N-1)", () => {
    // [2,4,4,4,5,5,7,9]: mean=5, population variance = 4
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4, 10);
  });

  it("stddev is the square root of variance", () => {
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
  });

  it("is 0 for a constant array (no spread at all)", () => {
    expect(variance([7, 7, 7])).toBe(0);
    expect(stddev([7, 7, 7])).toBe(0);
  });
});

// Confirmed 2026-08-14: the model previously had to eyeball two numbers
// and estimate a percentage in prose ("that's roughly a 12% increase")
// — the same unreliable-arithmetic failure mode analytics.aggregate/
// percentage already exist to prevent, just for a growth comparison.
describe("growthPercent", () => {
  it("computes a positive growth percentage", () => {
    expect(growthPercent(100, 120)).toBe(20);
  });

  it("computes a negative growth percentage (a decline)", () => {
    expect(growthPercent(200, 150)).toBe(-25);
  });

  it("uses the absolute value of 'from' as the denominator (a negative baseline still yields a sane percentage)", () => {
    expect(growthPercent(-100, -50)).toBe(50);
  });

  it("throws instead of returning Infinity/NaN when 'from' is 0", () => {
    expect(() => growthPercent(0, 50)).toThrow(/division by zero/);
  });
});

describe("computeStatsOp", () => {
  it("dispatches to the correct op", () => {
    expect(computeStatsOp("sum", [1, 2, 3])).toBe(6);
    expect(computeStatsOp("avg", [1, 2, 3])).toBe(2);
    expect(computeStatsOp("median", [1, 2, 3])).toBe(2);
    expect(computeStatsOp("min", [3, 1, 2])).toBe(1);
    expect(computeStatsOp("max", [3, 1, 2])).toBe(3);
    expect(computeStatsOp("variance", [7, 7, 7])).toBe(0);
    expect(computeStatsOp("stddev", [7, 7, 7])).toBe(0);
  });
});

// Confirmed 2026-08-14: added as a typed, audited Pattern-A tool
// (analytics.correlate) rather than a general code-execution sandbox —
// Pearson's coefficient is THE standard formula for linear correlation,
// nothing bespoke to invent here.
describe("pearsonCorrelation", () => {
  it("returns +1 for a perfect positive linear relationship", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
  });

  it("returns -1 for a perfect negative linear relationship", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 10);
  });

  it("returns 0 for a symmetric non-linear relationship (y=x^2, zero LINEAR correlation despite a real pattern)", () => {
    expect(pearsonCorrelation([-2, -1, 0, 1, 2], [4, 1, 0, 1, 4])).toBeCloseTo(0, 10);
  });

  it("throws when the two series have different lengths (a meaningless pairing)", () => {
    expect(() => pearsonCorrelation([1, 2, 3], [1, 2])).toThrow(/equal length/);
  });

  it("throws with fewer than 2 paired points", () => {
    expect(() => pearsonCorrelation([1], [1])).toThrow(/at least 2/);
  });

  it("throws when one series has zero variation (undefined correlation, not a real 0)", () => {
    expect(() => pearsonCorrelation([5, 5, 5], [1, 2, 3])).toThrow(/zero variation/);
  });
});
