import { detectCountQuestionPhrase, COUNT_QUESTION_HINT, detectRateQuestionPhrase, RATE_QUESTION_HINT, detectGroupingQuestionPhrase, GROUPING_QUESTION_HINT, detectDashboardQuestionPhrase, DASHBOARD_QUESTION_HINT, detectCorrelationQuestionPhrase, CORRELATION_QUESTION_HINT, detectChartToolPhrase, CHART_TOOL_HINT, detectSimpleChartPhrase, SIMPLE_CHART_HINT, detectFullReportPhrase, FULL_REPORT_HINT } from "../countQuestionHint";

// Confirmed live 2026-08-10: "how many employees were absent this month
// compared to last month" was answered with fabricated/miscounted
// numbers (42/63 stated vs. a real 31/120) because the model called
// attendance.list twice and eyeballed the results instead of using
// analytics.aggregate's op:"count" (which exists and is correct). This
// suite locks in the detector that appends a concrete hint onto exactly
// the messages that need it — see countQuestionHint.ts's doc comment.
describe("detectCountQuestionPhrase", () => {
  it("detects 'how many'", () => {
    expect(detectCountQuestionPhrase("How many employees were absent this month?")).toBe(true);
  });

  it("detects a period comparison via 'compared to'", () => {
    expect(detectCountQuestionPhrase("Compare this month's attendance to last month's.")).toBe(true);
  });

  it("detects 'number of'", () => {
    expect(detectCountQuestionPhrase("What's the number of open purchase orders?")).toBe(true);
  });

  it("detects 'count of'", () => {
    expect(detectCountQuestionPhrase("Give me a count of unpaid invoices.")).toBe(true);
  });

  it("detects 'vs'", () => {
    expect(detectCountQuestionPhrase("Sales this week vs last week?")).toBe(true);
  });

  it("does not fire on an unrelated question", () => {
    expect(detectCountQuestionPhrase("What's our company name?")).toBe(false);
  });

  it("does not fire on a plain list request with no counting/comparison language", () => {
    expect(detectCountQuestionPhrase("List quotations that haven't converted to a sales order.")).toBe(false);
  });

  it("exports a hint that names the real tool to use", () => {
    expect(COUNT_QUESTION_HINT).toContain("analytics.aggregate");
    expect(COUNT_QUESTION_HINT).toContain('op:"count"');
  });
});

// Confirmed live 2026-08-11: "compare this month's inspection pass rate
// to last month's" got the real counts right (21/64, matching direct
// SQL) but answered with those raw counts AS IF they were a rate -
// never computed a real percentage, never used analytics.percentage.
describe("detectRateQuestionPhrase", () => {
  it("detects 'rate'", () => {
    expect(detectRateQuestionPhrase("What's our inspection pass rate this month?")).toBe(true);
  });

  it("detects 'percentage'/'percent'/'%'", () => {
    expect(detectRateQuestionPhrase("What percentage of invoices are unpaid?")).toBe(true);
    expect(detectRateQuestionPhrase("What percent of orders shipped late?")).toBe(true);
    expect(detectRateQuestionPhrase("What's the % outstanding?")).toBe(true);
  });

  it("detects 'proportion'/'ratio'", () => {
    expect(detectRateQuestionPhrase("What proportion of leads converted?")).toBe(true);
    expect(detectRateQuestionPhrase("What's the pass-to-fail ratio?")).toBe(true);
  });

  it("does not fire on a plain count question with no rate language", () => {
    expect(detectRateQuestionPhrase("How many quotations are open?")).toBe(false);
  });

  it("exports a hint that names the real tool and warns against a bare count", () => {
    expect(RATE_QUESTION_HINT).toContain("analytics.percentage");
    expect(RATE_QUESTION_HINT).toMatch(/not the same as a lower rate/);
  });
});

// Confirmed live 2026-08-11: "which customer has the most open
// quotations right now" got the WRONG answer (a customer with 2, when
// the real max was a different customer with 4) - the model sampled a
// few customers and guessed instead of using analytics.aggregate's
// groupBy for a complete, exact breakdown.
describe("detectGroupingQuestionPhrase", () => {
  it("detects 'most'/'least'/'highest'/'lowest'", () => {
    expect(detectGroupingQuestionPhrase("Which customer has the most open quotations?")).toBe(true);
    expect(detectGroupingQuestionPhrase("Which item has the lowest stock?")).toBe(true);
    expect(detectGroupingQuestionPhrase("What's our highest value purchase order?")).toBe(true);
  });

  it("detects 'top'/'biggest'/'largest'/'smallest'/'fewest'", () => {
    expect(detectGroupingQuestionPhrase("Top 5 customers by revenue")).toBe(true);
    expect(detectGroupingQuestionPhrase("Our biggest supplier this month")).toBe(true);
    expect(detectGroupingQuestionPhrase("Which department has the fewest open tasks?")).toBe(true);
  });

  it("detects 'breakdown by'/'group by'/'per <entity>'", () => {
    expect(detectGroupingQuestionPhrase("Give me a breakdown by department")).toBe(true);
    expect(detectGroupingQuestionPhrase("Group sales orders by customer")).toBe(true);
    expect(detectGroupingQuestionPhrase("Show revenue per customer")).toBe(true);
  });

  it("does not fire on an unrelated question", () => {
    expect(detectGroupingQuestionPhrase("What's our company name?")).toBe(false);
    expect(detectGroupingQuestionPhrase("List open quotations")).toBe(false);
  });

  // Confirmed live 2026-08-15: this exact phrasing reached the model with
  // NO grouping hint at all (the old pattern only matched the single
  // compound word "breakdown"), leading to a 12-call guess-every-status-
  // literal spiral instead of one real groupBy call.
  it("detects 'broken down by' (two words, confirmed live gap)", () => {
    expect(detectGroupingQuestionPhrase("Show me a bar chart of leads broken down by status")).toBe(true);
    expect(detectGroupingQuestionPhrase("break down sales by region")).toBe(true);
  });

  it("exports a hint that names the real tool and warns against sampling/guessing", () => {
    expect(GROUPING_QUESTION_HINT).toContain("groupBy");
    expect(GROUPING_QUESTION_HINT).toMatch(/never happened to check/);
  });
});

// Confirmed live 2026-08-17: a real user asked "get me lead graph" then
// "give me chart of leads" — both bare, single-entity chart requests, no
// dashboard/kpi/trend/type signal at all. Both got DASHBOARD_QUESTION_HINT
// (chart/graph used to be unconditionally bundled into that pattern) and
// the model dutifully followed its "call analytics.aggregate" instruction
// — real log: 3-10 aggregate/calculate calls, including nonsensical sum/avg
// of the "id" field, never chart.build, never even the simple *.list-once
// auto-render path SYSTEM_PROMPT already documents for exactly this shape.
// No chart ever rendered, twice.
describe("detectSimpleChartPhrase", () => {
  it("detects the exact live-failing prompts — a bare chart/graph mention with nothing else", () => {
    expect(detectSimpleChartPhrase("get me lead graph")).toBe(true);
    expect(detectSimpleChartPhrase("give me chart of leads")).toBe(true);
    expect(detectSimpleChartPhrase("Show this as a chart")).toBe(true);
    expect(detectSimpleChartPhrase("Can you plot revenue over time?")).toBe(true);
    expect(detectSimpleChartPhrase("Visualize open tickets by priority")).toBe(true);
  });

  it("does NOT fire when a specific chart type is named — that needs chart.build (CHART_TOOL_HINT) instead", () => {
    expect(detectSimpleChartPhrase("Give me a pie chart of leads by source")).toBe(false);
    expect(detectSimpleChartPhrase("Draw a line chart of monthly revenue")).toBe(false);
    expect(detectSimpleChartPhrase("Build me a dashboard with several charts")).toBe(false);
  });

  it("does NOT fire when real dashboard/kpi/analytics/trend wording is present — that needs DASHBOARD_QUESTION_HINT instead", () => {
    expect(detectSimpleChartPhrase("What's the trend for support tickets, show me a chart")).toBe(false);
    expect(detectSimpleChartPhrase("Give me a chart of our sales KPIs")).toBe(false);
    expect(detectSimpleChartPhrase("Chart the analytics for this quarter")).toBe(false);
  });

  it("does not fire on an unrelated question", () => {
    expect(detectSimpleChartPhrase("List open quotations")).toBe(false);
  });

  it("exports a hint that says exactly one *.list call, no analytics tool, and forbids the observed nonsense (summing an id field)", () => {
    expect(SIMPLE_CHART_HINT).toMatch(/exactly ONCE/);
    expect(SIMPLE_CHART_HINT).toMatch(/"render":"chart"/);
    expect(SIMPLE_CHART_HINT).toMatch(/Do NOT call analytics\.aggregate/);
    expect(SIMPLE_CHART_HINT).toMatch(/"id" field/);
  });
});

// Added 2026-08-15 alongside the new chart.build tool.
describe("detectChartToolPhrase", () => {
  it("detects an explicit chart TYPE by name", () => {
    expect(detectChartToolPhrase("Give me a pie chart of leads by source")).toBe(true);
    expect(detectChartToolPhrase("Show a donut chart of sales orders by status")).toBe(true);
    expect(detectChartToolPhrase("Draw a line chart of monthly revenue")).toBe(true);
    expect(detectChartToolPhrase("Show me a bar chart of leads broken down by status")).toBe(true);
  });

  it("detects a request for more than one chart", () => {
    expect(detectChartToolPhrase("Build me a dashboard with several charts")).toBe(true);
    expect(detectChartToolPhrase("Give me multiple charts showing our sales")).toBe(true);
  });

  it("does not fire on a plain, untyped 'chart'/'graph' request (the old auto-render path handles that)", () => {
    expect(detectChartToolPhrase("Give me a graph of today's leads")).toBe(false);
    expect(detectChartToolPhrase("Show this as a chart")).toBe(false);
  });

  it("exports a hint that names the tool and the fetch-then-build sequence", () => {
    expect(CHART_TOOL_HINT).toContain("chart.build");
    expect(CHART_TOOL_HINT).toMatch(/analytics\.aggregate/);
  });
});

// Confirmed live 2026-08-14: "Create a quick dashboard of how the sales
// are shaping up in the last 6 months. Use publicly available Sales KPI
// for comparison" got 105 raw sales_invoice.list rows dumped into a
// table labeled "a summary" — no totals, no trend, no chart. The model
// correctly avoided inventing external benchmark numbers, but never
// reached for analytics.aggregate either, since "dashboard"/"KPI"
// doesn't match any existing count/rate/grouping pattern.
describe("detectDashboardQuestionPhrase", () => {
  // Split into 4 labeled word groups (chart/KPI/analytics/dashboard) in
  // countQuestionHint.ts rather than one opaque regex — each covers a
  // distinct real-world phrasing category people actually use, and each
  // is tested independently here so a gap in one category shows up
  // clearly instead of being masked by the others passing.
  // 2026-08-17: bare "chart"/"graph"/"plot"/"visualize" moved OUT of this
  // pattern (see detectSimpleChartPhrase's own doc comment below for the
  // real live bug this fixes) — only a genuine trend/kpi/analytics/
  // dashboard signal fires DASHBOARD_QUESTION_HINT now. "trend" alone still
  // does, since a real trend line needs real multi-period numbers the
  // simple one-shot auto-render path can't produce.
  it("detects trend wording, but NOT a bare chart/graph/plot/visualize mention", () => {
    expect(detectDashboardQuestionPhrase("What's the trend for support tickets?")).toBe(true);
    expect(detectDashboardQuestionPhrase("Give me a chart of sales this month")).toBe(false);
    expect(detectDashboardQuestionPhrase("Graph the leads by status")).toBe(false);
    expect(detectDashboardQuestionPhrase("Can you plot revenue over time?")).toBe(false);
    expect(detectDashboardQuestionPhrase("Visualize open tickets by priority")).toBe(false);
  });

  it("detects KPI/metric wording", () => {
    expect(detectDashboardQuestionPhrase("Show me our sales KPIs")).toBe(true);
    expect(detectDashboardQuestionPhrase("What's our current KPI for support tickets?")).toBe(true);
    expect(detectDashboardQuestionPhrase("What are our key performance indicators this quarter?")).toBe(true);
    expect(detectDashboardQuestionPhrase("Give me the metrics for purchasing")).toBe(true);
  });

  it("detects total/average/sum/growth wording (common colloquial asks for a computed number)", () => {
    expect(detectDashboardQuestionPhrase("What's the total sales this month?")).toBe(true);
    expect(detectDashboardQuestionPhrase("What's the average deal size?")).toBe(true);
    expect(detectDashboardQuestionPhrase("Sum of all outstanding invoices")).toBe(true);
    expect(detectDashboardQuestionPhrase("How's our sales growth this quarter?")).toBe(true);
  });

  it("detects YoY/MoM/QoQ period-over-period wording", () => {
    expect(detectDashboardQuestionPhrase("Show YoY revenue")).toBe(true);
    expect(detectDashboardQuestionPhrase("What's the MoM change in leads?")).toBe(true);
    expect(detectDashboardQuestionPhrase("Compare quarter-over-quarter sales")).toBe(true);
  });

  it("detects analytics/insight wording", () => {
    expect(detectDashboardQuestionPhrase("Give me the analytics for this quarter")).toBe(true);
    expect(detectDashboardQuestionPhrase("Analyze our sales performance")).toBe(true);
    expect(detectDashboardQuestionPhrase("Any insights on customer churn?")).toBe(true);
    expect(detectDashboardQuestionPhrase("What are the stats for open tickets?")).toBe(true);
    expect(detectDashboardQuestionPhrase("Give me a snapshot of purchasing")).toBe(true);
    expect(detectDashboardQuestionPhrase("What are the numbers for this quarter?")).toBe(true);
    expect(detectDashboardQuestionPhrase("Give me the figures for Q2")).toBe(true);
  });

  it("detects 'dashboard', 'overview', 'shaping up', and 'performance overview/summary'", () => {
    expect(detectDashboardQuestionPhrase("Create a quick dashboard of sales this month")).toBe(true);
    expect(detectDashboardQuestionPhrase("How are sales shaping up this quarter?")).toBe(true);
    expect(detectDashboardQuestionPhrase("Give me a performance overview for HR")).toBe(true);
    expect(detectDashboardQuestionPhrase("I need a performance summary of purchasing")).toBe(true);
    expect(detectDashboardQuestionPhrase("Give me an overview of procurement")).toBe(true);
  });

  it("does not fire on an unrelated question", () => {
    expect(detectDashboardQuestionPhrase("List open quotations")).toBe(false);
    expect(detectDashboardQuestionPhrase("What's our company name?")).toBe(false);
  });

  it("exports a hint that names the real tool, requires a chart for trends, and forbids inventing benchmarks", () => {
    expect(DASHBOARD_QUESTION_HINT).toContain("analytics.aggregate");
    expect(DASHBOARD_QUESTION_HINT).toMatch(/not a dashboard/);
    expect(DASHBOARD_QUESTION_HINT).toMatch(/"render":"chart"/);
    expect(DASHBOARD_QUESTION_HINT).toMatch(/do not invent a number/);
  });
});

// Confirmed live 2026-08-14 (same night analytics.correlate was added):
// "is there a correlation between employee base salary and their total
// CTC?" got a nonsensical "-95.83% growth" answer — the model called
// analytics.aggregate twice for two unrelated SUMS then fed them into
// analytics.calculate's op:"growth", never touching analytics.correlate
// at all, since nothing detected "correlation" as needing it.
describe("detectCorrelationQuestionPhrase", () => {
  it("detects 'correlate'/'correlation'/'correlated'", () => {
    expect(detectCorrelationQuestionPhrase("Is there a correlation between salary and CTC?")).toBe(true);
    expect(detectCorrelationQuestionPhrase("Does deal size correlate with days to close?")).toBe(true);
    expect(detectCorrelationQuestionPhrase("Are stock levels correlated with reorder frequency?")).toBe(true);
  });

  it("detects 'relationship between'", () => {
    expect(detectCorrelationQuestionPhrase("What's the relationship between order value and delivery time?")).toBe(true);
  });

  it("does not fire on an unrelated question", () => {
    expect(detectCorrelationQuestionPhrase("What's our company name?")).toBe(false);
    expect(detectCorrelationQuestionPhrase("List open quotations")).toBe(false);
  });

  it("exports a hint that names the real tool, requires paired per-record values, and forbids calling it growth", () => {
    expect(CORRELATION_QUESTION_HINT).toContain("analytics.correlate");
    expect(CORRELATION_QUESTION_HINT).toMatch(/PAIRED PER-RECORD/);
    expect(CORRELATION_QUESTION_HINT).toMatch(/never use it here/);
  });
});

describe("detectFullReportPhrase", () => {
  it("detects explicit file-download intent words", () => {
    expect(detectFullReportPhrase("export the sales register")).toBe(true);
    expect(detectFullReportPhrase("download the full customer list")).toBe(true);
    expect(detectFullReportPhrase("get me a pdf of all quotations")).toBe(true);
    expect(detectFullReportPhrase("can you export this as a PDF")).toBe(true);
  });

  // Confirmed live 2026-08-17, a real user correction: this used to also
  // match "all"/"full"/"entire"/"complete"/"every", which meant an
  // ordinary "give me all quotations" ask got redirected away from the
  // normal 25-row-page quotation.list table entirely. That's wrong — an
  // ordinary list request (however it's phrased) must keep working
  // exactly as it always did; only an explicit file/export/download/PDF
  // ask should route to report.generate. See countQuestionHint.ts's own
  // doc comment for the full story, and reasoningEngine.ts's
  // reportPdfStep for how the full-dataset PDF is now offered
  // ADDITIONALLY (a next_step button) rather than as a replacement.
  it("does NOT fire on ordinary 'all'/'full'/'entire'/'complete'/'every' list wording — normal pagination must be unaffected", () => {
    expect(detectFullReportPhrase("give me all quotations")).toBe(false);
    expect(detectFullReportPhrase("I need the entire invoice list")).toBe(false);
    expect(detectFullReportPhrase("show me a complete list of leads")).toBe(false);
    expect(detectFullReportPhrase("list every quotation this year")).toBe(false);
    expect(detectFullReportPhrase("show me the full customer list")).toBe(false);
  });

  it("does NOT fire on bare 'report' alone — the existing small-report *.report.* path still handles this", () => {
    expect(detectFullReportPhrase("show me the profit and loss report for this month")).toBe(false);
    expect(detectFullReportPhrase("can I see the general ledger report?")).toBe(false);
    expect(detectFullReportPhrase("what does the stock balance report say")).toBe(false);
  });

  it("does not fire on an unrelated plain question", () => {
    expect(detectFullReportPhrase("what's our company name?")).toBe(false);
    expect(detectFullReportPhrase("list open quotations")).toBe(false);
  });

  it("exports a hint that names report.generate, both source shapes, and forbids describing rows it doesn't have", () => {
    expect(FULL_REPORT_HINT).toContain("report.generate");
    expect(FULL_REPORT_HINT).toContain('source:"named_report"');
    expect(FULL_REPORT_HINT).toContain('source:"entity_query"');
    expect(FULL_REPORT_HINT).toMatch(/never attempt to describe, summarize, or list individual/);
  });
});
