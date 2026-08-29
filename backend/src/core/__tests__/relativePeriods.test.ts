import { resolveRelativePeriod, detectRelativePeriodPhrase, RELATIVE_PERIODS, resolveLastNMonths } from "../relativePeriods";

// Fixed "today" for every test so results are deterministic regardless
// of when the suite runs. 2026-08-09 is a Sunday (confirmed live with
// the user the same day this module was built) — deliberately keeps
// the Monday-start-week math exercised at a real boundary case.
const TODAY = "2026-08-09";

describe("resolveRelativePeriod", () => {
  it("resolves today", () => {
    expect(resolveRelativePeriod("today", TODAY)).toEqual([TODAY, TODAY]);
  });

  it("resolves yesterday", () => {
    expect(resolveRelativePeriod("yesterday", TODAY)).toEqual(["2026-08-08", "2026-08-08"]);
  });

  // Confirmed live 2026-08-12: "who absent day before yesterday" (today =
  // Aug 12) got answered with Aug 11's data mislabeled as "the day before
  // yesterday" — Aug 11 is yesterday, the real day before yesterday is
  // Aug 10. Root cause was detectRelativePeriodPhrase matching the
  // "yesterday" SUBSTRING inside the longer phrase (see its own test
  // below) and handing the model an explicit wrong instruction.
  it("resolves day_before_yesterday as a distinct date from yesterday", () => {
    expect(resolveRelativePeriod("day_before_yesterday", TODAY)).toEqual(["2026-08-07", "2026-08-07"]);
  });

  it("resolves this_week as Monday-start, ending today's week (not sliding)", () => {
    // 2026-08-09 is a Sunday -> this week's Monday is 2026-08-03
    expect(resolveRelativePeriod("this_week", TODAY)).toEqual(["2026-08-03", "2026-08-09"]);
  });

  it("resolves last_week as the full prior Mon-Sun calendar week", () => {
    expect(resolveRelativePeriod("last_week", TODAY)).toEqual(["2026-07-27", "2026-08-02"]);
  });

  it("resolves last_7_days as a trailing window, distinct from last_week", () => {
    expect(resolveRelativePeriod("last_7_days", TODAY)).toEqual(["2026-08-02", "2026-08-09"]);
  });

  it("resolves this_month from the 1st to today", () => {
    expect(resolveRelativePeriod("this_month", TODAY)).toEqual(["2026-08-01", "2026-08-09"]);
  });

  it("resolves last_month as the full prior calendar month", () => {
    expect(resolveRelativePeriod("last_month", TODAY)).toEqual(["2026-07-01", "2026-07-31"]);
  });

  it("resolves last_month correctly across a year boundary", () => {
    expect(resolveRelativePeriod("last_month", "2026-01-15")).toEqual(["2025-12-01", "2025-12-31"]);
  });

  it("resolves last_30_days as a trailing window", () => {
    expect(resolveRelativePeriod("last_30_days", TODAY)).toEqual(["2026-07-10", "2026-08-09"]);
  });

  // Confirmed live 2026-08-12 (pm2 error log): both "leave in the last 2
  // weeks" and "quotations from the last 2 months" got rejected with
  // "Unknown relative period" — a real user-phrasing gap, not the model
  // guessing wrong. Added as trailing-N-days windows, same shape as
  // last_7_days/last_30_days above.
  it("resolves last_14_days as a trailing window", () => {
    expect(resolveRelativePeriod("last_14_days", TODAY)).toEqual(["2026-07-26", "2026-08-09"]);
  });

  it("resolves last_60_days as a trailing window", () => {
    expect(resolveRelativePeriod("last_60_days", TODAY)).toEqual(["2026-06-10", "2026-08-09"]);
  });

  it("resolves this_year from Jan 1 to today", () => {
    expect(resolveRelativePeriod("this_year", TODAY)).toEqual(["2026-01-01", TODAY]);
  });

  // Added 2026-08-23 per explicit user request. TODAY (2026-08-09) falls
  // in Q3 (Jul-Sep) — calendar-quarter-to-date, same convention this_week/
  // this_month already use.
  it("resolves this_quarter from the quarter's start to today", () => {
    expect(resolveRelativePeriod("this_quarter", TODAY)).toEqual(["2026-07-01", TODAY]);
  });

  it("resolves last_quarter as the full prior calendar quarter (Q2: Apr-Jun)", () => {
    expect(resolveRelativePeriod("last_quarter", TODAY)).toEqual(["2026-04-01", "2026-06-30"]);
  });

  it("resolves last_quarter correctly across a year boundary (Q1 -> prior year's Q4)", () => {
    expect(resolveRelativePeriod("last_quarter", "2026-02-15")).toEqual(["2025-10-01", "2025-12-31"]);
  });

  it("resolves last_year as the full prior calendar year, not a trailing 365 days", () => {
    expect(resolveRelativePeriod("last_year", TODAY)).toEqual(["2025-01-01", "2025-12-31"]);
  });

  it("tolerates casing and separator variations in the input", () => {
    expect(resolveRelativePeriod("Last Week", TODAY)).toEqual(resolveRelativePeriod("last_week", TODAY));
    expect(resolveRelativePeriod("last-week", TODAY)).toEqual(resolveRelativePeriod("last_week", TODAY));
    expect(resolveRelativePeriod(" LAST_WEEK ", TODAY)).toEqual(resolveRelativePeriod("last_week", TODAY));
  });

  it("throws on a period outside the fixed vocabulary rather than guessing", () => {
    expect(() => resolveRelativePeriod("next_week", TODAY)).toThrow(/Unknown relative period/);
  });

  it("covers every member of the exported vocabulary without throwing", () => {
    for (const period of RELATIVE_PERIODS) {
      expect(() => resolveRelativePeriod(period, TODAY)).not.toThrow();
    }
  });
});

describe("detectRelativePeriodPhrase", () => {
  it("detects a plain phrase", () => {
    expect(detectRelativePeriodPhrase("show me quotations from last week")).toBe("last_week");
  });

  // Added 2026-08-23 per explicit user request.
  it("detects 'this quarter' / 'last quarter' / 'last year' as their own periods", () => {
    expect(detectRelativePeriodPhrase("sales this quarter")).toBe("this_quarter");
    expect(detectRelativePeriodPhrase("sales last quarter")).toBe("last_quarter");
    expect(detectRelativePeriodPhrase("sales last year")).toBe("last_year");
  });

  it("prefers the more specific 'last 7 days' over a bare 'last week' pattern it could otherwise be confused with", () => {
    expect(detectRelativePeriodPhrase("purchase orders from the last 7 days")).toBe("last_7_days");
  });

  it("maps 'past week' to the trailing-window last_7_days, not the calendar last_week", () => {
    expect(detectRelativePeriodPhrase("what happened in the past week")).toBe("last_7_days");
  });

  it("checks this_week before a hypothetical shorter substring match", () => {
    expect(detectRelativePeriodPhrase("sales this week please")).toBe("this_week");
  });

  it("is case-insensitive", () => {
    expect(detectRelativePeriodPhrase("YESTERDAY's leads")).toBe("yesterday");
  });

  // The exact live bug: "day before yesterday" contains the word
  // "yesterday" as a genuine whole-word substring, so the bare
  // /\byesterday\b/i pattern used to match it first and silently turn
  // "day before yesterday" into plain "yesterday" — a full day off with
  // no indication anything had been substituted.
  it("detects 'day before yesterday' as its own distinct period, not plain 'yesterday'", () => {
    expect(detectRelativePeriodPhrase("who absent day before yesterday")).toBe("day_before_yesterday");
  });

  it("detects '2 days ago' / 'two days ago' as the same day_before_yesterday period", () => {
    expect(detectRelativePeriodPhrase("what happened 2 days ago")).toBe("day_before_yesterday");
    expect(detectRelativePeriodPhrase("show me orders from two days ago")).toBe("day_before_yesterday");
  });

  // Confirmed live 2026-08-12: these phrasings crashed with "Unknown
  // relative period" before last_14_days/last_60_days existed. Also
  // proves the "must precede the shorter pattern" ordering note above —
  // "last 2 weeks" must resolve to last_14_days, not get caught by the
  // bare /\blast\s+week\b/i pattern first.
  it("detects 'last 2 weeks' / 'last two weeks' as last_14_days, not last_week", () => {
    expect(detectRelativePeriodPhrase("who's on leave in the last 2 weeks")).toBe("last_14_days");
    expect(detectRelativePeriodPhrase("attendance for the last two weeks")).toBe("last_14_days");
    expect(detectRelativePeriodPhrase("orders from the last 14 days")).toBe("last_14_days");
  });

  it("detects 'last 2 months' / 'last two months' as last_60_days, not last_month", () => {
    expect(detectRelativePeriodPhrase("quotations from the last 2 months")).toBe("last_60_days");
    expect(detectRelativePeriodPhrase("sales orders in the last two months")).toBe("last_60_days");
    expect(detectRelativePeriodPhrase("invoices from the last 60 days")).toBe("last_60_days");
  });

  it("returns null when the message mentions no fixed-vocabulary phrase", () => {
    expect(detectRelativePeriodPhrase("how many customers do we have")).toBeNull();
  });

  it("does not false-positive on unrelated words containing similar substrings", () => {
    expect(detectRelativePeriodPhrase("the weekend was busy")).toBeNull();
  });
});

// Real, live-found gap closed 2026-08-26: a genuine "monthly trend over
// the last 6 months" question had no way to express itself through the
// fixed single-period vocabulary above (nothing between last_month and
// last_60_days) — resolveLastNMonths closes it with real, calendar-
// aligned month buckets computed deterministically in one call.
describe("resolveLastNMonths", () => {
  it("returns N real calendar months, oldest first, the current month last and capped at today", () => {
    const months = resolveLastNMonths(TODAY, 6); // TODAY = 2026-08-09
    expect(months.map((m) => m.label)).toEqual(["March 2026", "April 2026", "May 2026", "June 2026", "July 2026", "August 2026"]);
    expect(months[0]).toEqual({ label: "March 2026", start: "2026-03-01", end: "2026-03-31" });
    expect(months[3]).toEqual({ label: "June 2026", start: "2026-06-01", end: "2026-06-30" });
    // Current month (August) is partial — capped at todayIso, not the
    // 31st, since the rest of the month hasn't happened yet.
    expect(months[5]).toEqual({ label: "August 2026", start: "2026-08-01", end: "2026-08-09" });
  });

  it("correctly rolls back across a year boundary", () => {
    const months = resolveLastNMonths("2026-02-15", 3); // Feb 2026 -> Dec/Jan/Feb, crossing into 2025
    expect(months.map((m) => m.label)).toEqual(["December 2025", "January 2026", "February 2026"]);
    expect(months[0]).toEqual({ label: "December 2025", start: "2025-12-01", end: "2025-12-31" });
  });

  it("handles n=1 as just the current (partial) month", () => {
    expect(resolveLastNMonths(TODAY, 1)).toEqual([{ label: "August 2026", start: "2026-08-01", end: TODAY }]);
  });
});
