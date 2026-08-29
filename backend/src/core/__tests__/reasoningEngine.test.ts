import {
  appendChainNextSteps,
  appendAutoflowNextSteps,
  collapseToFirstLineForTabularRender,
  correctStatedCount,
  correctStatedSuperlative,
  extractDisplayIntent,
  resolveEntityKey,
  stripHandTypedMarkdownTables,
  stripHandTypedListRepeats,
  stripFabricatedDocumentLinks,
  stripFabricatedReportLinks,
  capToolResultForContext,
  stripGroupsForContext,
  capRowsForRender,
  stripObjectArtifacts,
  stripMarkdownEmphasis,
  toGroupAggregateTableRows,
  flattenBareAggregate,
  mergeToolResults,
  mergeLinkedEnrichment,
  combineMultiFieldAggregates,
  recordGetFocus,
  shouldRenderChart,
  stripChartAnnouncement,
  stripFabricatedImageMarkdown,
  buildToolCallKey,
  buildAggregateChartSpec,
} from "../reasoningEngine";
import { sessionCacheProvider } from "../../providers/context/sessionCacheProvider";

describe("buildAggregateChartSpec", () => {
  it("builds a status composition chart from real grouped aggregate values", () => {
    const chart = buildAggregateChartSpec(
      { chart: { type: "donut", title: "Quotations by Status" } },
      { groups: [{ key: "Open", value: 12, count: 12 }, { key: "Ordered", value: 8, count: 8 }] }
    );

    expect(chart).toMatchObject({
      chartType: "donut",
      title: "Quotations by Status",
      slices: [
        { label: "Open", value: 12 },
        { label: "Ordered", value: 8 },
      ],
    });
  });

  it("builds a multi-series trend chart from aggregate metric groups", () => {
    const chart = buildAggregateChartSpec(
      { chart: { type: "line", title: "Document Trend" } },
      { groups: [{ key: "June 2026", Quotations: 10, Invoices: 7 }, { key: "July 2026", Quotations: 12, Invoices: 9 }] }
    );

    expect(chart).toMatchObject({
      chartType: "line",
      labels: ["June 2026", "July 2026"],
      series: [
        { name: "Quotations", values: [10, 12] },
        { name: "Invoices", values: [7, 9] },
      ],
    });
  });

  it("does not create a chart when the aggregate did not request one", () => {
    expect(buildAggregateChartSpec({}, { groups: [{ key: "Open", value: 1, count: 1 }] })).toBeUndefined();
  });
});

describe("appendChainNextSteps", () => {
  const allowed = new Set(["sales_order.create"]);

  it("adds a 'Convert to Sales Order' suggestion for each eligible quotation row", () => {
    const rows = [
      { id: "QTN-001", status: "Open" },
      { id: "QTN-002", status: "Replied" },
      { id: "QTN-003", status: "Ordered" }, // not eligible
    ];
    const steps = appendChainNextSteps("quotation", rows, allowed);
    expect(steps).toEqual(["Convert QTN-001 to Sales Order", "Convert QTN-002 to Sales Order"]);
  });

  it("adds nothing when the acting user's role can't call the chain's create tool", () => {
    const rows = [{ id: "QTN-001", status: "Open" }];
    const steps = appendChainNextSteps("quotation", rows, new Set(["quotation.list"]));
    expect(steps).toEqual([]);
  });

  it("adds nothing for an entity with no defined chain", () => {
    const rows = [{ id: "SO-001", status: "Open" }];
    expect(appendChainNextSteps("sales_order", rows, allowed)).toEqual([]);
  });

  it("adds nothing for an undefined entityKey (e.g. a non-list tool result)", () => {
    expect(appendChainNextSteps(undefined, [{ id: "X", status: "Open" }], allowed)).toEqual([]);
  });

  it("skips a row with no id rather than emitting a broken label", () => {
    const rows = [{ status: "Open" }];
    expect(appendChainNextSteps("quotation", rows, allowed)).toEqual([]);
  });

  it("preserves and de-duplicates against an existing next_steps list", () => {
    const rows = [{ id: "QTN-001", status: "Open" }];
    const existing = ["Mark as won", "Convert QTN-001 to Sales Order"];
    const steps = appendChainNextSteps("quotation", rows, allowed, existing);
    expect(steps).toEqual(["Mark as won", "Convert QTN-001 to Sales Order"]);
  });

  // Confirmed live 2026-08-10: opening a single already-converted
  // quotation (status "Ordered") still offered a "Convert to Sales
  // Order" button — the model added it on its own judgment via
  // DISPLAY_INTENT.next_steps, and this function previously only ever
  // ADDED eligible labels, never stripped an ineligible one that was
  // already present. Locks in the fix: an ineligible row's exact label
  // gets removed from `existing` even if the model supplied it.
  it("strips a model-supplied next_step for a row that is NOT actually eligible", () => {
    const rows = [{ id: "QTN-003", status: "Ordered" }];
    const existing = ["Convert QTN-003 to Sales Order"];
    const steps = appendChainNextSteps("quotation", rows, allowed, existing);
    expect(steps).toEqual([]);
  });

  it("strips only the ineligible row's label, leaving unrelated next_steps and eligible labels intact", () => {
    const rows = [
      { id: "QTN-001", status: "Open" },
      { id: "QTN-003", status: "Ordered" },
    ];
    const existing = ["Mark as won", "Convert QTN-003 to Sales Order"];
    const steps = appendChainNextSteps("quotation", rows, allowed, existing);
    expect(steps).toEqual(["Mark as won", "Convert QTN-001 to Sales Order"]);
  });

  // Added 2026-08-12, verified against ERPNext's own real DocField
  // "status" Select options (never guessed) — see CHAIN_NEXT_STEPS' own
  // doc comment for the full status-value reasoning.
  it("adds a 'Create a Quotation' suggestion for each eligible open/replied opportunity", () => {
    const rows = [
      { id: "OPP-001", status: "Open" },
      { id: "OPP-002", status: "Replied" },
      { id: "OPP-003", status: "Converted" }, // not eligible
    ];
    const steps = appendChainNextSteps("opportunity", rows, new Set(["quotation.create"]));
    expect(steps).toEqual(["Create a Quotation from OPP-001", "Create a Quotation from OPP-002"]);
  });

  // material_request -> rfq deliberately has NO entry in CHAIN_NEXT_STEPS
  // (see its own doc comment): rfq.create doesn't exist as a real tool in
  // this deployment at all (request_for_quotation's entity config is
  // list/get only, no createFields). Locks in that this stays a no-op
  // rather than silently promising a button that could never work.
  it("adds nothing for material_request — rfq.create doesn't exist as a real tool yet", () => {
    const rows = [{ id: "MR-001", status: "Pending" }];
    expect(appendChainNextSteps("material_request", rows, new Set(["rfq.create"]))).toEqual([]);
  });
});

// 2026-08-23, explicit user request: config-driven next-steps
// (EntityConfig.autoflow), tested against the REAL purchase_order
// config (config/modules/buying/entity/purchase_order.ts) since this
// function reads ENTITY_CONFIGS directly, not a mockable module-level
// constant the way CHAIN_NEXT_STEPS is.
describe("appendAutoflowNextSteps", () => {
  it("upgrades a literal 'Submit' label to a real structured NextStep with a query, only when the submit tool is actually allowed", () => {
    const rows = [{ id: "PUR-ORD-2026-00001", status: "Draft" }];
    const steps = appendAutoflowNextSteps("purchase_order", rows, new Set(["purchase_order.submit"]));
    expect(steps).toEqual([{ label: "Submit", action: "submit", query: { tool: "purchase_order.submit", args: { id: "PUR-ORD-2026-00001" } } }]);
  });

  it("drops the Submit step entirely — never a dead button — when this role isn't actually granted purchase_order.submit", () => {
    const rows = [{ id: "PUR-ORD-2026-00001", status: "Draft" }];
    expect(appendAutoflowNextSteps("purchase_order", rows, new Set(["purchase_order.list"]))).toEqual([]);
  });

  it("keeps a navigational label ('View Receipt'/'View Invoice') as a plain string — no fixed id to attach, needs a real lookup on click", () => {
    const rows = [{ id: "PUR-ORD-2026-00001", status: "To Receive and Bill" }];
    const steps = appendAutoflowNextSteps("purchase_order", rows, new Set());
    expect(steps).toEqual(["View Receipt", "View Invoice"]);
  });

  it("is a no-op for a status this entity's autoflow config doesn't cover", () => {
    const rows = [{ id: "PUR-ORD-2026-00001", status: "Cancelled" }];
    expect(appendAutoflowNextSteps("purchase_order", rows, new Set(["purchase_order.submit"]))).toEqual([]);
  });

  it("is a no-op for a multi-row list (never spams next-steps across a list, same reasoning as appendChainNextSteps)", () => {
    const rows = [
      { id: "PUR-ORD-2026-00001", status: "Draft" },
      { id: "PUR-ORD-2026-00002", status: "Draft" },
    ];
    expect(appendAutoflowNextSteps("purchase_order", rows, new Set(["purchase_order.submit"]))).toEqual([]);
  });

  it("is a no-op for an entity with no autoflow config at all", () => {
    const rows = [{ id: "SAL-QTN-2026-00001", status: "Open" }];
    expect(appendAutoflowNextSteps("quotation", rows, new Set())).toEqual([]);
  });
});

// 2026-08-23: the legacy crm.* tools (crm.list_opportunities,
// crm.get_lead, ...) that used to need a special-case exception map here
// were deleted from modules/crm/index.ts — every entity now goes through
// the generic <entityKey>.<action> shape only, so a plain split(".")[0]
// is always correct.
describe("resolveEntityKey", () => {
  it("resolves a generic tool name by its prefix", () => {
    expect(resolveEntityKey("quotation.get")).toBe("quotation");
    expect(resolveEntityKey("opportunity.list")).toBe("opportunity");
    expect(resolveEntityKey("lead.create")).toBe("lead");
  });

  it("returns undefined for an undefined tool name", () => {
    expect(resolveEntityKey(undefined)).toBeUndefined();
  });
});

describe("collapseToFirstLineForTabularRender", () => {
  it("leaves a single-line message untouched regardless of render type", () => {
    expect(collapseToFirstLineForTabularRender("Here are the results.", "table")).toBe("Here are the results.");
  });

  it("collapses a multi-line reply to its first line when render is 'table'", () => {
    const msg = "Here are the results.\n1. QTN-001 - Acme Corp\n2. QTN-002 - Beta Inc";
    expect(collapseToFirstLineForTabularRender(msg, "table")).toBe("Here are the results.");
  });

  it("collapses a multi-line reply to its first line when render is 'cards'", () => {
    const msg = "Summary line.\nExtra duplicate detail.";
    expect(collapseToFirstLineForTabularRender(msg, "cards")).toBe("Summary line.");
  });

  it("does not collapse for render types other than table/cards", () => {
    const msg = "Line one.\nLine two.";
    expect(collapseToFirstLineForTabularRender(msg, "none")).toBe(msg);
  });

  it("falls back to the original message if the first line is blank", () => {
    const msg = "\nSecond line has the content";
    expect(collapseToFirstLineForTabularRender(msg, "table")).toBe(msg);
  });
});

// Confirmed live 2026-08-10: "list quotations, then separately list sales
// orders" hand-typed TWO full markdown tables directly in prose instead
// of using DISPLAY_INTENT (which only ever renders one table per turn).
describe("stripHandTypedMarkdownTables", () => {
  it("leaves an ordinary message with no table untouched", () => {
    const msg = "There are no quotations from this week.";
    expect(stripHandTypedMarkdownTables(msg)).toBe(msg);
  });

  it("leaves a message with only one stray pipe-containing line untouched (not a real table)", () => {
    const msg = "The formula is a | b, not a table.";
    expect(stripHandTypedMarkdownTables(msg)).toBe(msg);
  });

  it("strips a hand-typed markdown table, keeping only the text before it", () => {
    const msg =
      "Here are the most recent quotations:\n\n" +
      "| ID | Party | Status |\n" +
      "|----|-------|--------|\n" +
      "| SAL-QTN-001 | Acme | Open |\n\n" +
      "Here are the most recent sales orders:\n\n" +
      "| ID | Customer | Status |\n" +
      "|----|----------|--------|\n" +
      "| SAL-ORD-001 | Acme | Completed |";
    const result = stripHandTypedMarkdownTables(msg);
    expect(result).toContain("Here are the most recent quotations:");
    expect(result).not.toContain("SAL-QTN-001");
    expect(result).not.toContain("SAL-ORD-001");
    expect(result).not.toContain("|----|");
  });

  it("falls back to a generic lead-in when the table starts at the very first line", () => {
    const msg = "| ID | Status |\n|----|--------|\n| X | Open |";
    expect(stripHandTypedMarkdownTables(msg)).toContain("Here's what I found.");
  });
});

// Real, live-confirmed failure (2026-08-21): a real RFQ lookup hit a
// genuine cross-entity linkage gap and fell back to hedging, re-listing
// all 20 real RFQ ids/statuses/dates as a plain numbered list WHILE a
// real DISPLAY_INTENT table ALSO rendered the same rows directly below
// it — the same "shown twice" duplicate stripHandTypedMarkdownTables
// closes above, just in a format (no pipe characters at all) that
// regex could never match.
describe("stripHandTypedListRepeats", () => {
  it("leaves an ordinary message with no list untouched", () => {
    const msg = "There are no quotations from this week.";
    expect(stripHandTypedListRepeats(msg)).toBe(msg);
  });

  it("leaves a short, legitimate narrative numbered list untouched (not a real data dump)", () => {
    const msg = "To fix this: 1. Check the filter. 2. Retry the search. 3. Ask again if it still fails.";
    expect(stripHandTypedListRepeats(msg)).toBe(msg);
  });

  it("strips a real hand-typed row-by-row re-listing (5+ numbered lines), keeping only the text before it", () => {
    const msg =
      "Here are the RFQs we submitted:\n\n" +
      "1. PUR-RFQ-2026-00001 (Submitted on 2025-03-17)\n" +
      "2. PUR-RFQ-2026-00002 (Submitted on 2025-03-17)\n" +
      "3. PUR-RFQ-2026-00003 (Submitted on 2025-03-18)\n" +
      "4. PUR-RFQ-2026-00004 (Submitted on 2025-03-20)\n" +
      "5. PUR-RFQ-2026-00005 (Submitted on 2025-03-21)";
    const result = stripHandTypedListRepeats(msg);
    expect(result).toContain("Here are the RFQs we submitted:");
    expect(result).not.toContain("PUR-RFQ-2026-00001");
    expect(result).not.toContain("PUR-RFQ-2026-00005");
  });

  it("falls back to a generic lead-in when the list starts at the very first line", () => {
    const msg = "1. A\n2. B\n3. C\n4. D\n5. E";
    expect(stripHandTypedListRepeats(msg)).toContain("Here's what I found.");
  });
});

// Confirmed live 2026-08-12: despite the system prompt explicitly saying a
// document.get_pdf reply must never include a URL/markdown link/fabricated
// domain, the model sometimes wrote one anyway — e.g. "[Download
// PDF](https://example.com/api/agent/document-pdf?...)" — even though the
// real download button already renders separately and correctly regardless
// of what the message text says. Deterministic backstop, same pattern as
// stripHandTypedMarkdownTables.
describe("stripFabricatedDocumentLinks", () => {
  it("leaves an ordinary one-sentence document message untouched", () => {
    const msg = "Here's the PDF for SAL-QTN-2026-00001.";
    expect(stripFabricatedDocumentLinks(msg)).toBe(msg);
  });

  it("strips a fabricated markdown link and surrounding filler, keeping the real lead-in", () => {
    const msg =
      "Here's the PDF for purchase invoice ACC-PINV-2026-00292. You can download it using the link below: " +
      "[Download PDF](https://example.com/api/agent/document-pdf?entityKey=purchase_invoice&id=ACC-PINV-2026-00292) " +
      "If there's anything else you need, feel free to ask!";
    const result = stripFabricatedDocumentLinks(msg);
    expect(result).not.toContain("example.com");
    expect(result).not.toContain("[Download PDF]");
    expect(result).toContain("Here's the PDF for purchase invoice ACC-PINV-2026-00292.");
  });

  it("strips a bare URL even without markdown link syntax", () => {
    const msg = "Here's the PDF: https://example.com/api/agent/document-pdf?id=X";
    expect(stripFabricatedDocumentLinks(msg)).not.toContain("http");
  });

  it("strips a sandbox:-scheme link (confirmed live variant, not just https://example.com)", () => {
    const msg = "Here's the PDF.\n\nYou can download it [here](sandbox:/api/agent/document-pdf?entityKey=purchase_order&id=X).";
    const result = stripFabricatedDocumentLinks(msg);
    expect(result).not.toContain("sandbox:");
    expect(result).not.toContain("document-pdf");
    expect(result).toContain("Here's the PDF.");
  });

  it("falls back to a generic message if stripping leaves nothing", () => {
    const msg = "[Download PDF](https://example.com/api/agent/document-pdf?id=X)";
    expect(stripFabricatedDocumentLinks(msg)).toBe("Here's the PDF.");
  });
});

// Confirmed live 2026-08-17, same failure class as stripFabricatedDocumentLinks
// above, hit by the real deployed backend: "give me all quotations" answered
// with "Here are all the quotations: [Download Quotations](https://your-link-
// here/api/agent/report-pdf?...)" despite the SYSTEM_PROMPT rule — a fabricated
// domain wrapped around an otherwise-correct relative path. Same deterministic
// backstop, same reasoning, applied to report.generate's identically-shaped
// result.
// Confirmed live 2026-08-17: "export the full general ledger report for
// this year" crashed the whole turn — "Request too large for gpt-4o-mini
// ... Requested 373143" tokens against a 200000 TPM limit — because
// accounting.report.general_ledger (an existing, pre-this-session tool)
// has no row cap and its full raw result was being pushed straight into
// the LLM's own context unconditionally. See capToolResultForContext's
// own doc comment in reasoningEngine.ts for the full root-cause story.
// Real, explicit product ask (2026-08-21): "u never show any record to
// llm" — the same rule relayReasoningEngine.ts's own shared final-push
// point enforces, closing the asymmetry for this LOCAL engine's own
// single-loop dispatch (see stripGroupsForContext's own doc comment in
// reasoningEngine.ts).
describe("stripGroupsForContext", () => {
  // Real, explicit product ask (2026-08-26): "when analytic aggregate
  // called it must not strip" / "analytics tools result must pass" — a
  // groupBy result is a small, already-computed calculation (one row
  // per real category), not raw per-record data, so it now passes
  // through alongside the paging metadata instead of being stripped
  // down to just the metadata. See this function's own doc comment for
  // the full "why".
  it("passes real group data through alongside counts/paging metadata", () => {
    const result = {
      overall: { value: 700, count: 4 },
      groups: [{ key: "Acme", value: 400, count: 2 }],
      totalGroups: 1,
      pageIndex: 1,
      pageCount: 20,
      hasMore: false,
    };
    expect(stripGroupsForContext(result)).toEqual({
      overall: { value: 700, count: 4 },
      groups: [{ key: "Acme", value: 400, count: 2 }],
      totalGroups: 1,
      pageIndex: 1,
      pageCount: 20,
      hasMore: false,
    });
  });

  it("leaves a bare (non-groupBy) aggregate result untouched — no groups array to strip", () => {
    const result = { overall: { value: 100, count: 1 } };
    expect(stripGroupsForContext(result)).toBe(result);
  });

  // 2026-08-23: real bug found live — this test used to assert the bare
  // array was left UNTOUCHED, which meant real row data (every field,
  // every record) reached the model's own context for every plain list
  // call, unlike the relay's own equivalent {count,hasMore} collapse.
  // Now strips the same way, mirroring the relay's real fix.
  it("collapses a real *.list array to {count, hasMore} — same 'never show a record to the LLM' rule as groupBy/join above", () => {
    const rows = [{ id: "QTN-1" }, { id: "QTN-2" }];
    expect(stripGroupsForContext(rows)).toEqual({ count: 2, hasMore: false, query: { tool: undefined } });
  });

  it("hasMore reflects the real explicit limit when the model asked for one", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `QTN-${i}` }));
    expect(stripGroupsForContext(rows, "quotation.list", { limit: 5 })).toEqual({ count: 5, hasMore: true, nextOffset: 5, query: { tool: "quotation.list", limit: 5 } });
    expect(stripGroupsForContext(rows, "quotation.list", { limit: 10 })).toEqual({ count: 5, hasMore: false, query: { tool: "quotation.list", limit: 10 } });
  });

  it("falls back to the documented default page size (25) as hasMore's threshold when no limit was given", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `QTN-${i}` }));
    expect(stripGroupsForContext(rows)).toEqual({ count: 25, hasMore: true, nextOffset: 25, query: { tool: undefined } });
  });
});

describe("capToolResultForContext", () => {
  it("passes a normal-sized result through unchanged", () => {
    const result = { overall: { value: 1000, count: 5 } };
    expect(capToolResultForContext(result, "analytics.aggregate")).toBe(result);
  });

  it("passes a realistic small *.list page (25 rows) through unchanged", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `QTN-${i}`, party: "Acme Corp", grand_total: 12000 + i, status: "Open" }));
    expect(capToolResultForContext(rows, "quotation.list")).toBe(rows);
  });

  it("replaces an oversized result (the exact live failure shape: thousands of GL rows) with a small, actionable error", () => {
    const hugeResult = Array.from({ length: 5000 }, (_, i) => ({
      posting_date: "2026-01-05",
      account: "Accounts Receivable - SEM",
      debit: 5000 + i,
      credit: 0,
      voucher_no: `ACC-JV-2026-${i.toString().padStart(5, "0")}`,
    }));
    const capped = capToolResultForContext(hugeResult, "accounting.report.general_ledger");
    expect(Array.isArray(capped)).toBe(false);
    expect(capped.error).toBeDefined();
    expect(JSON.stringify(capped).length).toBeLessThan(1000); // the replacement itself must be small, not just smaller
    expect(capped.error).toContain("accounting.report.general_ledger");
    expect(capped.error).toContain("report.generate");
    expect(capped.error).toMatch(/do not retry this exact call/i);
  });

  it("the cap threshold is comfortably above one full interactive list() page, so ordinary chat usage never triggers it", () => {
    // 200 rows is list()'s own documented explicit-request ceiling
    // (settingsService "list_page_size" / erpnextConnector.ts) — a
    // realistic largest "ordinary" page a user might explicitly ask for.
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: `QTN-${i}`, party: "Some Customer Pvt Ltd", grand_total: 45000, status: "Open", valid_till: "2026-09-01" }));
    expect(capToolResultForContext(rows, "quotation.list")).toBe(rows);
  });
});

// Confirmed live 2026-08-17, same incident as capToolResultForContext's own
// test block above: capping only the LLM's context stopped the token-limit
// crash, but the outgoing HTTP response's own `data`/`html` was still built
// from the full raw 1.7MB result — a real, separate problem (slow, and an
// HTML table with thousands of rows would hang a browser tab). This is the
// fix for that second half.
describe("capRowsForRender", () => {
  it("passes a normal-sized array through completely unchanged (same reference, no truncatedFrom)", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const result = capRowsForRender(rows);
    expect(result.data).toBe(rows);
    expect(result.truncatedFrom).toBeNull();
  });

  it("passes exactly MAX_INLINE_TABLE_ROWS (500) through unchanged — boundary, not off-by-one", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i }));
    const result = capRowsForRender(rows);
    expect(result.data).toBe(rows);
    expect(result.truncatedFrom).toBeNull();
  });

  it("truncates a large array to the first 500 rows and reports the real original count", () => {
    const rows = Array.from({ length: 3241 }, (_, i) => ({ id: i }));
    const result = capRowsForRender(rows);
    expect(result.data).toHaveLength(500);
    expect(result.data[0]).toEqual({ id: 0 });
    expect(result.data[499]).toEqual({ id: 499 });
    expect(result.truncatedFrom).toBe(3241);
  });

  it("leaves a non-array value (a single-record object, or a group-aggregate shape) completely untouched", () => {
    const single = { id: "QTN-0001", customer: "Acme" };
    expect(capRowsForRender(single)).toEqual({ data: single, truncatedFrom: null });
    expect(capRowsForRender(null)).toEqual({ data: null, truncatedFrom: null });
  });
});

describe("stripFabricatedReportLinks", () => {
  it("leaves an ordinary one-sentence report message untouched", () => {
    const msg = "Here are all 1,134 quotations.";
    expect(stripFabricatedReportLinks(msg)).toBe(msg);
  });

  it("strips a fabricated markdown link with a fake domain (the exact live failure), leaving a clean sentence not a dangling colon", () => {
    const msg = "Here are all the quotations: [Download Quotations](https://your-link-here/api/agent/report-pdf?source=entity_query&entityKey=quotation)";
    const result = stripFabricatedReportLinks(msg);
    expect(result).not.toContain("your-link-here");
    expect(result).not.toContain("[Download Quotations]");
    // Confirmed live 2026-08-17: the naive strip left "Here are all the
    // quotations:." (dangling colon + stray period) — fixed to collapse
    // the now-meaningless lead-in colon into a real full stop instead.
    expect(result).toBe("Here are all the quotations.");
  });

  it("strips a bare URL even without markdown link syntax", () => {
    const msg = "Here's your report: https://example.com/api/agent/report-pdf?source=entity_query&entityKey=lead";
    expect(stripFabricatedReportLinks(msg)).not.toContain("http");
  });

  it("falls back to a generic message if stripping leaves nothing", () => {
    const msg = "[Download Report](https://example.com/api/agent/report-pdf?source=named_report&reportKey=general_ledger)";
    expect(stripFabricatedReportLinks(msg)).toBe("Here's your report.");
  });
});

// Confirmed live 2026-08-12: "what's the total accounts receivable, and
// who are the top 3 customers by amount owed" answered with the real total
// but then "Here are the top 3 customers by amount owed: overall [object
// Object] [object Object]" — the model was handed a clean
// analytics.aggregate groupBy result and wrote JS's default object-to-
// string coercion straight into its prose instead of reading each group's
// key/value fields.
describe("stripObjectArtifacts", () => {
  it("leaves an ordinary message with no object artifact untouched", () => {
    const msg = "The total accounts receivable is ₹43,443,337.";
    expect(stripObjectArtifacts(msg)).toBe(msg);
  });

  it("strips '[object Object]' artifacts and appends a pointer to the real table", () => {
    const msg = "Here are the top 3 customers by amount owed: overall [object Object] [object Object]";
    const result = stripObjectArtifacts(msg);
    expect(result).not.toContain("[object Object]");
    expect(result).toContain("See the table below for the exact figures.");
  });

  it("also strips '[object Array]' artifacts", () => {
    const msg = "Breakdown by customer: [object Array]";
    expect(stripObjectArtifacts(msg)).not.toContain("[object Array]");
  });

  it("collapses leftover dangling punctuation after stripping", () => {
    const msg = "Top customers: [object Object], [object Object].";
    const result = stripObjectArtifacts(msg);
    expect(result).not.toMatch(/,\s*\./);
    expect(result).not.toContain("[object Object]");
  });

  it("falls back to a generic lead-in when stripping leaves nothing usable", () => {
    const msg = "[object Object]";
    expect(stripObjectArtifacts(msg)).toContain("Here's the breakdown.");
  });
});

// Confirmed live 2026-08-12: the chat bubble renders response.message in
// a plain <div>, never through a markdown parser — the model's own
// "**SAL-QTN-2026-01123**" showed up as literal asterisks instead of ever
// becoming bold.
describe("stripMarkdownEmphasis", () => {
  it("strips double-asterisk bold markers, keeping the inner text", () => {
    const msg = "The latest quotation is **SAL-QTN-2026-01123** for **Silver Line Electricals Industries**.";
    expect(stripMarkdownEmphasis(msg)).toBe("The latest quotation is SAL-QTN-2026-01123 for Silver Line Electricals Industries.");
  });

  it("leaves an ordinary message with no markdown emphasis untouched", () => {
    const msg = "The total accounts receivable is ₹43,443,337.";
    expect(stripMarkdownEmphasis(msg)).toBe(msg);
  });

  it("does not touch single asterisks or underscores (real field values commonly contain them)", () => {
    const msg = "The item_code is FG-4019 and the note says see * for details.";
    expect(stripMarkdownEmphasis(msg)).toBe(msg);
  });
});

// Confirmed live 2026-08-13: even after the SYSTEM_PROMPT explicitly said a
// "chart" DISPLAY_INTENT needs no separate action, real replies still ended
// with a stale narrated promise ("I'll generate a graph to visualize this
// now.") — the chart already exists by the time that sentence is read.
describe("stripChartAnnouncement", () => {
  it("strips a trailing 'I'll create/generate a graph now' sentence", () => {
    const msg = "I found 3 leads created today. I'll generate a graph to visualize their statuses now.";
    expect(stripChartAnnouncement(msg)).toBe("I found 3 leads created today.");
  });

  it("strips 'Now I will create a graph...' phrasing too", () => {
    const msg = "Here's the breakdown. Now I will create a graph for this data.";
    expect(stripChartAnnouncement(msg)).toBe("Here's the breakdown.");
  });

  it("strips 'Let me prepare a chart...' phrasing", () => {
    const msg = "3 leads found. Let me prepare a chart of their statuses.";
    expect(stripChartAnnouncement(msg)).toBe("3 leads found.");
  });

  it("strips 'Now, I will display this data in a graph format.' (confirmed live)", () => {
    const msg = 'I found three leads created today.\n\nNow, I will display this data in a graph format.';
    expect(stripChartAnnouncement(msg)).toBe("I found three leads created today.");
  });

  it("leaves an ordinary message with no such sentence untouched", () => {
    const msg = "I found 3 leads created today, 2 Lead and 1 Interested.";
    expect(stripChartAnnouncement(msg)).toBe(msg);
  });

  it("does not strip a sentence that merely describes an existing chart (no future/imperative phrasing)", () => {
    const msg = "Here's a graph of today's leads by status.";
    expect(stripChartAnnouncement(msg)).toBe(msg);
  });

  it("does not strip an unrelated 'I'll' sentence with no graph/chart wording", () => {
    const msg = "I'll create a new lead for you now.";
    expect(stripChartAnnouncement(msg)).toBe(msg);
  });
});

// Confirmed live 2026-08-15 against the real deployed server, testing the
// new chart.build tool: a genuinely correct pie chart reply still ended
// with a fabricated "![Quotations by Status](data:image/png;base64,...)"
// tag — fake placeholder data, not a real image — since this model can't
// actually produce image bytes and the chart already renders as real HTML
// alongside the text.
describe("stripFabricatedImageMarkdown", () => {
  it("strips a fabricated markdown image tag with fake base64 data (confirmed live)", () => {
    const msg =
      "Here is the pie chart. It shows Ordered: 73.9%, Lost: 15.9%, Open: 10.2%. " +
      "![Quotations by Status](data:image/png;base64,...)";
    expect(stripFabricatedImageMarkdown(msg)).toBe("Here is the pie chart. It shows Ordered: 73.9%, Lost: 15.9%, Open: 10.2%.");
  });

  it("strips an image tag pointing at a fabricated URL, not just fake base64", () => {
    const msg = "See the chart below. ![chart](https://example.com/not-real.png)";
    expect(stripFabricatedImageMarkdown(msg)).toBe("See the chart below.");
  });

  it("strips more than one image tag", () => {
    const msg = "First. ![a](data:x) Second. ![b](data:y)";
    expect(stripFabricatedImageMarkdown(msg)).toBe("First.  Second.");
  });

  it("leaves an ordinary message with no image markdown untouched", () => {
    const msg = "Here is the breakdown by status: Ordered 74%, Lost 16%, Open 10%.";
    expect(stripFabricatedImageMarkdown(msg)).toBe(msg);
  });

  it("does not touch a plain [text](url) markdown link (only !-prefixed image syntax)", () => {
    const msg = "See [the docs](https://example.com) for more.";
    expect(stripFabricatedImageMarkdown(msg)).toBe(msg);
  });
});

describe("toGroupAggregateTableRows", () => {
  it("reshapes a single groupBy result into {group,value,count} rows", () => {
    const data = { overall: { value: 100, count: 5 }, groups: [{ key: "Acme", value: 60, count: 3 }, { key: "Beta", value: 40, count: 2 }] };
    expect(toGroupAggregateTableRows(data)).toEqual([
      { group: "Acme", value: 60, count: 3 },
      { group: "Beta", value: 40, count: 2 },
    ]);
  });

  it("returns null for an ungrouped aggregate result (no groups array)", () => {
    expect(toGroupAggregateTableRows({ overall: { value: 100, count: 5 } })).toBeNull();
  });

  it("returns null for a plain list-shaped array or an unrelated object", () => {
    expect(toGroupAggregateTableRows([{ id: "X" }])).toBeNull();
    expect(toGroupAggregateTableRows({ document: { name: "X" } })).toBeNull();
    expect(toGroupAggregateTableRows(null)).toBeNull();
  });
});

// Confirmed live 2026-08-13, verifying the last_2_weeks vocabulary fix:
// "how many people were on leave in the last 2 weeks" answered correctly
// in prose (57), but the card underneath showed raw JSON
// {"value":57,"count":57} under a single "overall" label — a bare
// (non-groupBy) analytics.aggregate result was falling into the
// single-record cards path unflattened, one level short of what
// toGroupAggregateTableRows already does for the WITH-groups case above.
describe("flattenBareAggregate", () => {
  it("flattens {overall:{value,count}} into a plain {value,count} record", () => {
    expect(flattenBareAggregate({ overall: { value: 57, count: 57 } })).toEqual({ value: 57, count: 57 });
  });

  it("returns null when a groups array is present (the table-render path already handles that shape)", () => {
    const data = { overall: { value: 100, count: 5 }, groups: [{ key: "Acme", value: 60, count: 3 }] };
    expect(flattenBareAggregate(data)).toBeNull();
  });

  it("returns null for a plain list-shaped array, a real record, or an unrelated object", () => {
    expect(flattenBareAggregate([{ id: "X" }])).toBeNull();
    expect(flattenBareAggregate({ id: "QTN-001", status: "Open" })).toBeNull();
    expect(flattenBareAggregate({ document: { name: "X" } })).toBeNull();
    expect(flattenBareAggregate(null)).toBeNull();
  });

  // Confirmed live 2026-08-12: "top 3 customers by amount owed" called
  // analytics.aggregate 6 times in one turn (repeated groupBy field-name
  // guesses) — mergeToolResults bundled every successful result into one
  // array, and the LAST call to actually carry a real "groups" breakdown
  // needs to still be found and used, not just whichever landed first.
  describe("when mergeToolResults bundled multiple aggregate calls into an array", () => {
    const ungroupedRetry1 = { overall: { value: 43443337, count: 962 } }; // groupBy silently ignored (bad field)
    const ungroupedRetry2 = { overall: { value: 43443337, count: 962 } };
    const realBreakdown = {
      overall: { value: 43443337, count: 962 },
      groups: [
        { key: "Acme Corp", value: 900000, count: 4 },
        { key: "Beta Inc", value: 700000, count: 3 },
      ],
    };

    it("finds the real breakdown even when it isn't the first element", () => {
      const merged = [ungroupedRetry1, ungroupedRetry2, realBreakdown];
      expect(toGroupAggregateTableRows(merged)).toEqual([
        { group: "Acme Corp", value: 900000, count: 4 },
        { group: "Beta Inc", value: 700000, count: 3 },
      ]);
    });

    it("prefers the LAST groups-bearing element when more than one exists", () => {
      const olderBreakdown = { overall: { value: 1, count: 1 }, groups: [{ key: "Stale", value: 1, count: 1 }] };
      const merged = [olderBreakdown, ungroupedRetry1, realBreakdown];
      expect(toGroupAggregateTableRows(merged)?.[0].group).toBe("Acme Corp");
    });

    it("returns null when NONE of the merged results ever got a real breakdown", () => {
      expect(toGroupAggregateTableRows([ungroupedRetry1, ungroupedRetry2])).toBeNull();
    });
  });
});

// Confirmed live 2026-08-12: "what were our total bank transactions this
// month" made two SEPARATE analytics.aggregate calls (sum of "deposit",
// sum of "withdrawal") to answer one question — each a genuinely correct
// plain {overall:{value,count}} on its own, but rendered as an unlabeled
// two-row table with a single "overall" column holding each raw nested
// object as a stringified JSON blob. Neither number was ever readable,
// neither labeled deposit vs withdrawal.
describe("combineMultiFieldAggregates", () => {
  const toolCallsLogged = [
    { name: "bank_transaction.list", args: {} },
    { name: "analytics.aggregate", args: { op: "sum", field: "deposit", entityKey: "bank_transaction" } },
    { name: "analytics.aggregate", args: { op: "sum", field: "withdrawal", entityKey: "bank_transaction" } },
  ];
  const depositResult = { overall: { value: 2164658, count: 19 } };
  const withdrawalResult = { overall: { value: 660312, count: 19 } };

  it("combines repeated plain (non-groupBy) aggregate calls into one labeled groups breakdown", () => {
    const combined = combineMultiFieldAggregates("analytics.aggregate", [depositResult, withdrawalResult], toolCallsLogged);
    expect(toGroupAggregateTableRows(combined)).toEqual([
      { group: "deposit", value: 2164658, count: 19 },
      { group: "withdrawal", value: 660312, count: 19 },
    ]);
  });

  it("falls back to groupBy, then op, as the label when a call has no 'field' arg", () => {
    const calls = [
      { name: "analytics.aggregate", args: { op: "count", groupBy: "status" } },
      { name: "analytics.aggregate", args: { op: "count" } },
    ];
    const combined = combineMultiFieldAggregates("analytics.aggregate", [{ overall: { value: 1, count: 1 } }, { overall: { value: 2, count: 2 } }], calls);
    expect(toGroupAggregateTableRows(combined)?.map((r) => r.group)).toEqual(["status", "count"]);
  });

  it("leaves data untouched when sourceToolName isn't analytics.aggregate", () => {
    const data = [depositResult, withdrawalResult];
    expect(combineMultiFieldAggregates("bank_transaction.list", data, toolCallsLogged)).toBe(data);
  });

  it("leaves data untouched for a single aggregate call (nothing to combine)", () => {
    expect(combineMultiFieldAggregates("analytics.aggregate", depositResult, toolCallsLogged)).toBe(depositResult);
  });

  it("leaves data untouched when one of the results already has a real groups breakdown", () => {
    const realBreakdown = { overall: { value: 1, count: 1 }, groups: [{ key: "A", value: 1, count: 1 }] };
    const data = [depositResult, realBreakdown];
    expect(combineMultiFieldAggregates("analytics.aggregate", data, toolCallsLogged)).toBe(data);
  });

  it("leaves data untouched when the call count can't be correlated to the result count", () => {
    const data = [depositResult, withdrawalResult];
    const mismatchedCalls = [{ name: "analytics.aggregate", args: { field: "deposit" } }]; // only 1, not 2
    expect(combineMultiFieldAggregates("analytics.aggregate", data, mismatchedCalls)).toBe(data);
  });

  // Confirmed live 2026-08-14: "average deal size KPIs" made 3 calls, all
  // on field "amount" (sum/count/avg) — every row rendered labeled just
  // "amount", indistinguishable from the other two.
  it("disambiguates rows that share the same field by appending each one's own op", () => {
    const calls = [
      { name: "analytics.aggregate", args: { op: "sum", field: "amount" } },
      { name: "analytics.aggregate", args: { op: "count", field: "amount" } },
      { name: "analytics.aggregate", args: { op: "avg", field: "amount" } },
    ];
    const results = [{ overall: { value: 900, count: 3 } }, { overall: { value: 3, count: 3 } }, { overall: { value: 300, count: 3 } }];
    const combined = combineMultiFieldAggregates("analytics.aggregate", results, calls);
    expect(toGroupAggregateTableRows(combined)).toEqual([
      { group: "amount (sum)", value: 900, count: 3 },
      { group: "amount (count)", value: 3, count: 3 },
      { group: "amount (avg)", value: 300, count: 3 },
    ]);
  });

  it("does NOT disambiguate when labels genuinely differ (deposit/withdrawal stay exactly as before)", () => {
    const combined = combineMultiFieldAggregates("analytics.aggregate", [depositResult, withdrawalResult], toolCallsLogged);
    expect(toGroupAggregateTableRows(combined)).toEqual([
      { group: "deposit", value: 2164658, count: 19 },
      { group: "withdrawal", value: 660312, count: 19 },
    ]);
  });
});

describe("correctStatedCount", () => {
  it("replaces a wrong 'found N' count with the real row count", () => {
    const message = "I found 8 quotations from last week.";
    const data = new Array(97).fill({});
    expect(correctStatedCount(message, data)).toBe("I found 97 quotations from last week.");
  });

  it("replaces a wrong 'there are N' count", () => {
    const message = "There are 6 purchase orders pending.";
    const data = new Array(26).fill({});
    expect(correctStatedCount(message, data)).toBe("There are 26 purchase orders pending.");
  });

  it("replaces 'there is N' (singular phrasing) too", () => {
    const message = "There is 3 open lead.";
    const data = new Array(1).fill({});
    expect(correctStatedCount(message, data)).toBe("There is 1 open lead.");
  });

  it("leaves the message untouched when the stated count already matches", () => {
    const message = "I found 5 records.";
    const data = new Array(5).fill({});
    expect(correctStatedCount(message, data)).toBe(message);
  });

  it("never touches an unrelated number elsewhere in the message (e.g. a total amount)", () => {
    const message = "There are 6 invoices totalling 45000 rupees.";
    const data = new Array(6).fill({});
    const result = correctStatedCount(message, data);
    expect(result).toBe(message);
    expect(result).toContain("45000");
  });

  it("is a no-op when data isn't an array (e.g. a single get() result or aggregate scalar)", () => {
    const message = "There are 6 of them.";
    expect(correctStatedCount(message, { total: 6 })).toBe(message);
  });

  it("is a no-op when the message has no 'found N' / 'there are N' phrasing to correct", () => {
    const message = "Here is the quotation you asked about.";
    expect(correctStatedCount(message, [{}, {}])).toBe(message);
  });

  it("handles a comma-formatted stated count", () => {
    const message = "I found 1,200 records.";
    const data = new Array(1200).fill({});
    expect(correctStatedCount(message, data)).toBe(message);
  });
});

// Confirmed live 2026-08-13: "who is our highest paid employee?" returned
// a real, correct table (Asha Mehta ctc=1112088 genuinely the top row) but
// the model's own prose claimed "Swati Menon... CTC of ₹1,250,048" — the
// wrong person AND a fabricated number appearing nowhere in the real data.
describe("correctStatedSuperlative", () => {
  const rows = [
    { id: "HR-EMP-1", display_name: "Usha Verma", ctc: 738744 },
    { id: "HR-EMP-2", display_name: "Asha Mehta", ctc: 1112088 },
    { id: "HR-EMP-3", display_name: "Swati Menon", ctc: 1024032 },
  ];

  it("replaces a wrong name AND a fabricated number with the real highest row", () => {
    const message = "Our highest paid employee is Swati Menon, the CFO, with a CTC of ₹1,250,048.";
    expect(correctStatedSuperlative(message, rows)).toBe("The highest CTC is Asha Mehta at ₹11,12,088.");
  });

  it("leaves an already-correct highest-claim message untouched", () => {
    const message = "Our highest paid employee is Asha Mehta with a CTC of 1112088.";
    expect(correctStatedSuperlative(message, rows)).toBe(message);
  });

  it("handles a 'lowest' claim symmetrically", () => {
    const message = "The lowest paid employee is Swati Menon at ₹1,024,032.";
    expect(correctStatedSuperlative(message, rows)).toBe("The lowest CTC is Usha Verma at ₹7,38,744.");
  });

  it("is a no-op when data isn't a real array of 2+ rows", () => {
    expect(correctStatedSuperlative("highest ctc is X", { ctc: 5 })).toBe("highest ctc is X");
    expect(correctStatedSuperlative("highest ctc is X", [rows[0]])).toBe("highest ctc is X");
  });

  it("is a no-op when the message has no superlative keyword at all", () => {
    const message = "Here are all employees and their CTC.";
    expect(correctStatedSuperlative(message, rows)).toBe(message);
  });

  it("is a no-op when neither/both 'highest' and 'lowest' language appear (ambiguous)", () => {
    const message = "Comparing the highest and lowest CTC across employees.";
    expect(correctStatedSuperlative(message, rows)).toBe(message);
  });

  it("is a no-op when no recognized rankable field is present on every row (never guesses a field)", () => {
    const message = "The employee with the highest score is X.";
    const genericRows = [{ id: "A", score: 5 }, { id: "B", score: 9 }];
    expect(correctStatedSuperlative(message, genericRows)).toBe(message);
  });

  it("is a no-op when two or more rankable fields are present (ambiguous which one is meant)", () => {
    const message = "The invoice with the highest total is X.";
    const ambiguousRows = [
      { id: "A", total: 100, grand_total: 120 },
      { id: "B", total: 200, grand_total: 90 },
    ];
    expect(correctStatedSuperlative(message, ambiguousRows)).toBe(message);
  });

  it("falls back to id when display_name/party/customer are all absent", () => {
    const message = "Highest total is SAL-ORD-9999 at 500.";
    const idOnlyRows = [{ id: "SAL-ORD-0001", total: 100 }, { id: "SAL-ORD-9999", total: 900 }];
    expect(correctStatedSuperlative(message, idOnlyRows)).toBe("The highest total is SAL-ORD-9999 at ₹900.");
  });
});

describe("extractDisplayIntent", () => {
  it("parses a well-formed trailing DISPLAY_INTENT line and strips it from the message", () => {
    const text = 'Here are the results.\nDISPLAY_INTENT: {"render":"table","highlight":[],"next_steps":[]}';
    const { message, displayIntent } = extractDisplayIntent(text);
    expect(message).toBe("Here are the results.");
    expect(displayIntent).toEqual({ render: "table", highlight: [], next_steps: [] });
  });

  it("returns the full text with a null displayIntent when no marker is present", () => {
    const text = "Just a plain reply with no structured data.";
    const { message, displayIntent } = extractDisplayIntent(text);
    expect(message).toBe(text);
    expect(displayIntent).toBeNull();
  });

  it("returns a null displayIntent (not a throw) when the JSON after the marker is malformed", () => {
    const text = "Some reply.\nDISPLAY_INTENT: {not valid json";
    const { message, displayIntent } = extractDisplayIntent(text);
    expect(message).toBe("Some reply.");
    expect(displayIntent).toBeNull();
  });

  it("trims surrounding whitespace from the message portion", () => {
    const text = '  Padded reply.  \nDISPLAY_INTENT: {"render":"none"}';
    const { message } = extractDisplayIntent(text);
    expect(message).toBe("Padded reply.");
  });
});

// Confirmed live 2026-08-13: "give me graph of todays lead" against a real
// 3-row crm.list_leads result rendered a plain table, no chart anywhere —
// two stacked root causes: (1) buildResponse's isMultiRowList override
// unconditionally forced "table", silently erasing a genuine
// DISPLAY_INTENT:"chart"; (2) even fixed, trusting the model's
// DISPLAY_INTENT alone isn't enough in this codebase (see every other
// isSingleRecord/isGroupAggregate comment on why) — an over-eager model
// could start labelling ordinary "list my leads" replies "chart" too, with
// nothing in what the user actually typed asking for one.
describe("shouldRenderChart", () => {
  it("requires the model to have chosen chart", () => {
    expect(shouldRenderChart("table", "give me a graph of todays leads")).toBe(false);
    expect(shouldRenderChart(undefined, "give me a graph of todays leads")).toBe(false);
  });

  it("requires real graph/chart/plot/visualize wording from the user, not just the model's choice", () => {
    expect(shouldRenderChart("chart", "list my leads")).toBe(false);
    expect(shouldRenderChart("chart", undefined)).toBe(false);
  });

  it("passes when both the model's choice and the user's own wording agree", () => {
    expect(shouldRenderChart("chart", "give me graph of todays lead")).toBe(true);
    expect(shouldRenderChart("chart", "can you chart this by status")).toBe(true);
    expect(shouldRenderChart("chart", "plot the leads by source")).toBe(true);
    expect(shouldRenderChart("chart", "visualize this")).toBe(true);
    expect(shouldRenderChart("chart", "visualise this")).toBe(true);
  });

  it("is case-insensitive and matches the word anywhere in the message", () => {
    expect(shouldRenderChart("chart", "GRAPH me the leads please")).toBe(true);
  });

  it("doesn't false-positive on an unrelated word containing the same letters", () => {
    // "chart" shouldn't match inside an unrelated word like "charter".
    expect(shouldRenderChart("chart", "list our charter flights")).toBe(false);
  });
});

// Confirmed live 2026-08-11: "what is our raw materials stock" made 18
// separate bin.list calls (one per item) instead of one report call -
// only the LAST call's single row ever survived (a plain Map overwrites
// on a repeat key), so the user got 1 row back instead of the real
// 18-item picture, even though the model DID gather all the right data.
describe("mergeToolResults", () => {
  it("returns the single result unchanged for the common one-call case", () => {
    const result = { id: "X", qty: 5 };
    expect(mergeToolResults([result])).toBe(result);
  });

  it("concatenates multiple array (*.list) results into one combined list", () => {
    const merged = mergeToolResults([
      [{ id: "A" }, { id: "B" }],
      [{ id: "C" }],
    ]);
    expect(merged).toEqual([{ id: "A" }, { id: "B" }, { id: "C" }]);
  });

  it("collects multiple single-object results (repeated *.get()/aggregate calls) into an array", () => {
    const merged = mergeToolResults([
      { item: "RM-1000", actual_qty: 4351.11 },
      { item: "RM-1001", actual_qty: 4411.21 },
      { item: "RM-1002", actual_qty: 5172.15 },
    ]);
    expect(merged).toEqual([
      { item: "RM-1000", actual_qty: 4351.11 },
      { item: "RM-1001", actual_qty: 4411.21 },
      { item: "RM-1002", actual_qty: 5172.15 },
    ]);
  });

  it("falls back to the last result when shapes are mixed (defensive, no guessed merge)", () => {
    const last = { id: "last" };
    expect(mergeToolResults([[{ id: "A" }], last])).toBe(last);
  });

  // Confirmed live 2026-08-12: "what was yesterday's most recently
  // received quotation" called quotation.list with the exact same filter
  // three times in one turn — every real row then showed up 3x in the
  // final table, since this function's own array-concatenation branch
  // (built for the legitimate "one list call per customer" pattern above)
  // didn't distinguish that from redundant re-querying of the same data.
  it("dedupes repeated *.list() results by row id instead of blindly concatenating", () => {
    const merged = mergeToolResults([
      [{ id: "SAL-QTN-2026-01124" }, { id: "SAL-QTN-2026-01123" }],
      [{ id: "SAL-QTN-2026-01124" }, { id: "SAL-QTN-2026-01123" }],
      [{ id: "SAL-QTN-2026-01124" }, { id: "SAL-QTN-2026-01123" }],
    ]);
    expect(merged).toEqual([{ id: "SAL-QTN-2026-01124" }, { id: "SAL-QTN-2026-01123" }]);
  });

  it("falls back to a row's 'name' field when there's no 'id' (raw ERPNext-shaped rows)", () => {
    const merged = mergeToolResults([
      [{ name: "ACC-PINV-2026-00292", status: "Unpaid" }],
      [{ name: "ACC-PINV-2026-00292", status: "Unpaid" }],
    ]);
    expect(merged).toEqual([{ name: "ACC-PINV-2026-00292", status: "Unpaid" }]);
  });

  it("still combines genuinely different rows across repeated calls, not just the first one", () => {
    const merged = mergeToolResults([
      [{ id: "A" }],
      [{ id: "A" }],
      [{ id: "B" }],
    ]);
    expect(merged).toEqual([{ id: "A" }, { id: "B" }]);
  });

  it("keeps a row with neither 'id' nor 'name' as-is rather than guessing it's a duplicate", () => {
    const merged = mergeToolResults([
      [{ total: 100 }],
      [{ total: 100 }],
    ]);
    expect(merged).toEqual([{ total: 100 }, { total: 100 }]);
  });
});

// Confirmed live 2026-08-12: "Vikram was absent yesterday?" (an
// attendance.list call resolving to exactly one row) correctly answered
// about Vikram Joshi (HR-EMP-00037) — but the very next turn ("whats his
// contact number") answered about a completely different employee
// (Mahesh Iyer), the leftover LAST entry of an earlier turn's 5-call
// employee.get() batch. See recordGetFocus's own doc comment for the
// full root cause; these tests lock in the fix.
describe("recordGetFocus", () => {
  afterEach(() => jest.restoreAllMocks());

  it("still records a *.get() call's full result, keyed by entity (unchanged base case)", () => {
    const spy = jest.spyOn(sessionCacheProvider, "setFocus").mockImplementation(() => {});
    recordGetFocus("sess-1", new Map([["quotation.get", [{ id: "SAL-QTN-01", party: "Acme Corp" }]]]));
    expect(spy).toHaveBeenCalledWith("sess-1", "last_get_quotation", JSON.stringify({ id: "SAL-QTN-01", party: "Acme Corp" }));
  });

  it("also records a *.list() call that resolved to exactly one row (the attendance.list case)", () => {
    const spy = jest.spyOn(sessionCacheProvider, "setFocus").mockImplementation(() => {});
    recordGetFocus("sess-1", new Map([
      ["attendance.list", [[{ id: "HR-ATT-01", employee: "HR-EMP-00037", status: "Absent" }]]],
    ]));
    expect(spy).toHaveBeenCalledWith(
      "sess-1",
      "last_get_attendance",
      JSON.stringify({ id: "HR-ATT-01", employee: "HR-EMP-00037", status: "Absent" })
    );
  });

  it("ignores a *.list() call with zero or multiple rows — no single record to attribute focus to", () => {
    const spy = jest.spyOn(sessionCacheProvider, "setFocus").mockImplementation(() => {});
    recordGetFocus("sess-1", new Map([
      ["attendance.list", [[]]],
      ["quotation.list", [[{ id: "A" }, { id: "B" }]]],
    ]));
    expect(spy).not.toHaveBeenCalled();
  });

  it("propagates a single record's own real link field to the entity it points at (the actual fix)", () => {
    const spy = jest.spyOn(sessionCacheProvider, "setFocus").mockImplementation(() => {});
    recordGetFocus("sess-1", new Map([
      ["attendance.list", [[{ id: "HR-ATT-01", employee: "HR-EMP-00037", status: "Absent" }]]],
    ]));
    // The attendance record itself, AND a fresh employee stub via its
    // "employee" link field (attendance's real config.linkFields) — this
    // is what makes a later "his contact number" resolve to HR-EMP-00037
    // instead of whatever *.get() call happened to run last, turns ago.
    expect(spy).toHaveBeenCalledWith("sess-1", "last_get_employee", JSON.stringify({ id: "HR-EMP-00037" }));
  });

  it("a later single-record turn's link-field propagation overwrites an earlier turn's stale focus for the same entity", () => {
    const spy = jest.spyOn(sessionCacheProvider, "setFocus").mockImplementation(() => {});
    // Turn 1: a batch of employee.get() calls, as "who is absent
    // yesterday" issues one per row — last one processed is Mahesh.
    recordGetFocus("sess-1", new Map([
      ["employee.get", [{ id: "HR-EMP-00080" }, { id: "HR-EMP-00076" }, { id: "HR-EMP-00037" }, { id: "HR-EMP-00027" }]],
    ]));
    expect(spy).toHaveBeenLastCalledWith("sess-1", "last_get_employee", JSON.stringify({ id: "HR-EMP-00027" }));
    spy.mockClear();
    // Turn 2: "Vikram was absent yesterday?" — a single-row attendance
    // lookup for the RIGHT employee should overwrite that stale value.
    recordGetFocus("sess-1", new Map([
      ["attendance.list", [[{ id: "HR-ATT-01", employee: "HR-EMP-00037", status: "Absent" }]]],
    ]));
    expect(spy).toHaveBeenCalledWith("sess-1", "last_get_employee", JSON.stringify({ id: "HR-EMP-00037" }));
  });

  it("does nothing for a tool whose entity has no linkFields declared", () => {
    const spy = jest.spyOn(sessionCacheProvider, "setFocus").mockImplementation(() => {});
    recordGetFocus("sess-1", new Map([["customer.get", [{ id: "Acme Corp" }]]]));
    // Only the customer's own focus is set — no second call for anything else.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("sess-1", "last_get_customer", JSON.stringify({ id: "Acme Corp" }));
  });
});

// Confirmed live 2026-08-12: "top two employees with highest salary, with
// salary details" called salary_structure_assignment.list (sorted by
// ctc — the real ranking) then employee.get on each top id purely to
// attach a readable name. sourceToolName picked the LAST tool called
// (employee.get) since the model's own DISPLAY_INTENT.source was
// missing, so the rendered table showed names/departments/phone numbers
// with NO salary figures at all — the exact thing the user asked for.
describe("mergeLinkedEnrichment", () => {
  it("does nothing when sourceEntityKey is undefined", () => {
    expect(mergeLinkedEnrichment([{ id: "A" }], undefined, new Map())).toEqual([{ id: "A" }]);
  });

  it("does nothing for a normal single-tool-call turn (no other tool to enrich from)", () => {
    const data = [{ id: "SAL-QTN-01", party: "Acme Corp" }];
    const resultsByTool = new Map([["quotation.list", [data]]]);
    expect(mergeLinkedEnrichment(data, "quotation", resultsByTool)).toEqual(data);
  });

  it("reverse direction (the actual bug): the chosen source is the enrichment entity, and the REAL data is an earlier list whose own linkField points back at it", () => {
    // Source ended up as "employee" (the last tool called) — two merged
    // employee.get results, no salary data of their own.
    const employeeRows = [
      { id: "HR-EMP-00035", display_name: "Anil Sharma", department: "Accounts and Finance - SEMPL", status: "Active" },
      { id: "HR-EMP-00046", display_name: "Rahul Kapoor", department: "Sales and Marketing - SEMPL", status: "Active" },
    ];
    const resultsByTool = new Map<string, any[]>([
      [
        "salary_structure_assignment.list",
        [[
          { id: "HR-SSA-001", employee: "HR-EMP-00035", ctc: 4200000, base: 350000 },
          { id: "HR-SSA-002", employee: "HR-EMP-00046", ctc: 3900000, base: 325000 },
        ]],
      ],
      ["employee.get", [employeeRows[0], employeeRows[1]]],
    ]);
    const merged = mergeLinkedEnrichment(employeeRows, "employee", resultsByTool);
    expect(merged).toEqual([
      { id: "HR-EMP-00035", display_name: "Anil Sharma", department: "Accounts and Finance - SEMPL", status: "Active", ctc: 4200000, base: 350000 },
      { id: "HR-EMP-00046", display_name: "Rahul Kapoor", department: "Sales and Marketing - SEMPL", status: "Active", ctc: 3900000, base: 325000 },
    ]);
  });

  it("forward direction: the source's own linkField points OUT at a *.get() enrichment call", () => {
    // attendance's real config declares linkFields: { employee: "employee" }.
    const attendanceRow = { id: "HR-ATT-01", employee: "HR-EMP-00037", status: "Absent" };
    const resultsByTool = new Map<string, any[]>([
      ["attendance.get", [attendanceRow]],
      ["employee.get", [{ id: "HR-EMP-00037", display_name: "Vikram Joshi", department: "Sales and Marketing - SEMPL" }]],
    ]);
    const merged = mergeLinkedEnrichment(attendanceRow, "attendance", resultsByTool);
    expect(merged).toEqual({
      id: "HR-ATT-01", employee: "HR-EMP-00037", status: "Absent",
      display_name: "Vikram Joshi", department: "Sales and Marketing - SEMPL",
    });
  });

  it("never overwrites a field the source row already has, even if the enrichment shares the field name", () => {
    // Both "employee" and "salary_structure_assignment" happen to use
    // "id" as their own primary key field name — the assignment's own id
    // must never clobber the employee's real id.
    const employeeRow = { id: "HR-EMP-00035", status: "Active" };
    const resultsByTool = new Map<string, any[]>([
      ["salary_structure_assignment.list", [[{ id: "HR-SSA-001", employee: "HR-EMP-00035", ctc: 4200000 }]]],
      ["employee.get", [employeeRow]],
    ]);
    const merged = mergeLinkedEnrichment(employeeRow, "employee", resultsByTool);
    expect(merged).toEqual({ id: "HR-EMP-00035", status: "Active", ctc: 4200000 });
  });

  it("ignores an enrichment row that doesn't match any source row's linked id", () => {
    const employeeRow = { id: "HR-EMP-00035", status: "Active" };
    const resultsByTool = new Map<string, any[]>([
      ["salary_structure_assignment.list", [[{ id: "HR-SSA-999", employee: "HR-EMP-99999", ctc: 4200000 }]]],
      ["employee.get", [employeeRow]],
    ]);
    expect(mergeLinkedEnrichment(employeeRow, "employee", resultsByTool)).toEqual(employeeRow);
  });

  // Confirmed live 2026-08-12, the very next test of this fix: "top two
  // highest salary" called salary_structure_assignment.list TWICE in one
  // turn — an unsorted exploratory "limit 100" first, then the real
  // "sortBy ctc desc, limit 2" — and employee.list last (in default id
  // order, NOT ctc order) as the chosen source. Two bugs in one: (1) an
  // employee's OLDER/unsorted-call figures could silently win over their
  // real current ones, and (2) even with correct figures, the final rows
  // stayed in employee.list's arbitrary id order, silently undoing the
  // ranking the user actually asked for ("highest salary" listed lower
  // ctc first).
  it("uses only the LAST repeated call to the same tool, and adopts its row order — never an earlier exploratory call's", () => {
    // employee.list's own default order put the LOWER earner first —
    // exactly the real live symptom (Anjali, ctc 446472, listed ahead of
    // Preeti, ctc 1190040).
    const employeeRows = [
      { id: "HR-EMP-00002", display_name: "Anjali Reddy" },
      { id: "HR-EMP-00001", display_name: "Preeti Malhotra" },
    ];
    const resultsByTool = new Map<string, any[]>([
      [
        "salary_structure_assignment.list",
        [
          // Call 1: unsorted "limit 100" exploratory dump — deliberately
          // carries a STALE ctc for HR-EMP-00001 that must NOT win.
          [
            { id: "HR-SSA-OLD-1", employee: "HR-EMP-00001", ctc: 100 },
            { id: "HR-SSA-002", employee: "HR-EMP-00002", ctc: 446472 },
          ],
          // Call 2: the real "sortBy ctc desc, limit 2" — Preeti (00001)
          // genuinely highest, correctly listed first.
          [
            { id: "HR-SSA-001", employee: "HR-EMP-00001", ctc: 1190040 },
            { id: "HR-SSA-002", employee: "HR-EMP-00002", ctc: 446472 },
          ],
        ],
      ],
      ["employee.list", [employeeRows]],
    ]);
    const merged = mergeLinkedEnrichment(employeeRows, "employee", resultsByTool);
    expect(merged).toEqual([
      { id: "HR-EMP-00001", display_name: "Preeti Malhotra", ctc: 1190040 },
      { id: "HR-EMP-00002", display_name: "Anjali Reddy", ctc: 446472 },
    ]);
  });
});

describe("buildToolCallKey", () => {
  it("produces the same key for the exact same tool + arguments (the real repeat case: 21x crm.list_opportunities({}) in one turn)", () => {
    expect(buildToolCallKey("crm.list_opportunities", {})).toBe(buildToolCallKey("crm.list_opportunities", {}));
    const args = { filters: { status: "Open" }, limit: 20 };
    expect(buildToolCallKey("quotation.list", args)).toBe(buildToolCallKey("quotation.list", { ...args }));
  });

  it("is insensitive to argument key order (same call, different property order is still the same repeat)", () => {
    expect(buildToolCallKey("sales_order.list", { limit: 10, filters: { status: "Open" } }))
      .toBe(buildToolCallKey("sales_order.list", { filters: { status: "Open" }, limit: 10 }));
  });

  it("produces different keys for different tool names", () => {
    expect(buildToolCallKey("crm.get_lead", { id: "CRM-LEAD-1" })).not.toBe(buildToolCallKey("crm.get_opportunity", { id: "CRM-LEAD-1" }));
  });

  it("produces different keys when arguments genuinely differ (e.g. get_lead on different ids should never be deduped against each other)", () => {
    expect(buildToolCallKey("crm.get_lead", { id: "CRM-LEAD-1" })).not.toBe(buildToolCallKey("crm.get_lead", { id: "CRM-LEAD-2" }));
  });

  it("treats undefined/missing arguments the same as an empty object", () => {
    expect(buildToolCallKey("crm.list_leads", undefined)).toBe(buildToolCallKey("crm.list_leads", {}));
  });
});
