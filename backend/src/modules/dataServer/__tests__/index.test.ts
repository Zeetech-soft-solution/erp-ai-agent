jest.mock("../../../config/system.config", () => ({
  systemConnector: {
    aggregate: jest.fn().mockResolvedValue({ overall: { value: 0, count: 0 }, groups: [] }),
    list: jest.fn().mockResolvedValue([]),
  },
}));

import { dataServerModule, performJoin, runMetrics, paginateGroups, buildExecuteQueryMetadata, aggregateRows, normalizeExecuteQueryArgs, stepFeedsAggregation, JOIN_FETCH_CAP } from "../index";
import { systemConnector } from "../../../config/system.config";

const runTool = dataServerModule.tools.find((t) => t.name === "database_engine.execute_query")!;
const run = (args: any) => runTool.handler(args, { credential: {} } as any);

beforeEach(() => jest.clearAllMocks());

describe("database_engine.execute_query — entity validation", () => {
  it("rejects a genuinely unknown entityKey", async () => {
    await expect(run({ entityKey: "not_a_real_entity", op: "count" })).rejects.toThrow(/Unknown entity/);
  });

  it("requires op, metrics, or join — a bare entityKey alone is rejected with a clear redirect to <entity>.list", async () => {
    await expect(run({ entityKey: "sales_invoice" })).rejects.toThrow(/database_engine\.execute_query needs/);
  });
});

// Real, live-found bug (2026-08-23/24, interaction_log 3090) — recurred
// even after fixing the schema's own misleading link notation: once a
// join is involved, the model keeps reaching for SQL-JOIN-style
// "table.field" qualifiers (groupBy:"customer.display_name",
// metrics[].field:"sales_invoice.outstanding_amount", filters keys like
// "sales_invoice.status", join[].fields like "customer.phone") — none
// of which are real field names in this tool's schema. Confirmed live:
// this cascaded into repeated failed queries and a false capability
// denial ("there's a restriction... I cannot fetch this in a single
// query"). A deterministic normalization instead of a third wording
// attempt: strip any dotted prefix from every field name before
// anything runs — real field names never contain a literal ".".
describe("normalizeExecuteQueryArgs — strips SQL-style table.field prefixes, the exact live bug", () => {
  it("strips a dotted groupBy, metrics field, and metrics filter key", () => {
    const out = normalizeExecuteQueryArgs({
      entityKey: "customer",
      groupBy: "customer.display_name",
      metrics: [{ name: "total_overdue", op: "sum", field: "sales_invoice.outstanding_amount", filters: { "sales_invoice.status": "Overdue" } }],
    });
    expect(out.groupBy).toBe("display_name");
    expect(out.metrics[0].field).toBe("outstanding_amount");
    expect(out.metrics[0].filters).toEqual({ status: "Overdue" });
  });

  it("strips dotted leftKey/rightKey/fields/filters on a join ARRAY (the new N-way shape)", () => {
    const out = normalizeExecuteQueryArgs({
      entityKey: "sales_invoice",
      join: [{ entityKey: "customer", leftKey: "sales_invoice.customer", rightKey: "customer.id", fields: ["customer.phone", "customer.display_name"], filters: { "customer.group": "Retail" } }],
    });
    expect(out.join[0]).toMatchObject({ leftKey: "customer", rightKey: "id", fields: ["phone", "display_name"], filters: { group: "Retail" } });
  });

  it("strips dotted leftKey/rightKey on a join OBJECT too (the old single-table shape, still accepted)", () => {
    const out = normalizeExecuteQueryArgs({
      entityKey: "sales_invoice",
      join: { entityKey: "customer", leftKey: "sales_invoice.customer", rightKey: "customer.id" },
    });
    expect(out.join).toMatchObject({ leftKey: "customer", rightKey: "id" });
  });

  it("strips a dotted top-level field/fields/filters", () => {
    const out = normalizeExecuteQueryArgs({ entityKey: "customer", field: "customer.phone", fields: ["customer.id", "customer.phone"], filters: { "customer.territory": "North" } });
    expect(out.field).toBe("phone");
    expect(out.fields).toEqual(["id", "phone"]);
    expect(out.filters).toEqual({ territory: "North" });
  });

  it("a genuinely correct, already-bare call is left completely unchanged", () => {
    const args = { entityKey: "customer", groupBy: "id", op: "count", filters: { status: "Active" } };
    expect(normalizeExecuteQueryArgs(args)).toEqual(args);
  });

  // Live bug ("every customer's overdue + paid/unpaid invoice counts"):
  // the model calls execute_query with entityKey:"invoice" and groups by
  // "customer_id" — SQL-schema habit again. Both are repaired here, same
  // as the dotted-prefix strip.
  it("resolves an alias entityKey and strips a trailing _id from groupBy / join keys", () => {
    const out = normalizeExecuteQueryArgs({
      entityKey: "invoice",
      groupBy: "customer_id",
      metrics: [{ name: "paid", op: "count", filters: { status: "Paid" } }],
      join: [{ entityKey: "customers", leftKey: "customer_id", rightKey: "id" }],
    });
    expect(out.entityKey).toBe("sales_invoice");
    expect(out.groupBy).toBe("customer");
    expect(out.join[0].entityKey).toBe("customer");
    expect(out.join[0].leftKey).toBe("customer");
  });

  it("the real handler applies this automatically — a dotted join call resolves correctly, not silently mismatched", async () => {
    (systemConnector.list as jest.Mock)
      .mockResolvedValueOnce([{ id: "INV-1", customer: "CUST-A", status: "Paid" }])
      .mockResolvedValueOnce([{ id: "CUST-A", phone: "555-1234" }]);

    const result: any = await run({
      entityKey: "sales_invoice",
      join: [{ entityKey: "customer", leftKey: "sales_invoice.customer", rightKey: "customer.id", fields: ["customer.phone"] }],
    });
    expect(result.rowCount).toBe(1);
    expect(result.columns).toEqual(expect.arrayContaining(["id", "customer", "status", "phone"]));
  });
});

describe("database_engine.execute_query — aggregate mode (single op)", () => {
  it("calls systemConnector.aggregate with the real op/field/filters", async () => {
    await run({ entityKey: "sales_invoice", op: "sum", field: "total", filters: { status: "Paid" } });
    expect(systemConnector.aggregate).toHaveBeenCalledWith(
      "sales_invoice",
      {},
      expect.objectContaining({ op: "sum", field: "total", filters: { status: "Paid" } })
    );
  });

  it("requires field unless op is count", async () => {
    await expect(run({ entityKey: "sales_invoice", op: "sum" })).rejects.toThrow(/"field" required/);
    await expect(run({ entityKey: "sales_invoice", op: "count" })).resolves.toBeDefined();
  });
});

// The handler now always strips its real result down to metadata
// (rowCount/columns/aggregates/page/totalPages/hasMore) via
// buildExecuteQueryMetadata before returning — real row/group values
// are never observable through the handler's own return value anymore,
// by design (this tool's own real result never reaches the LLM raw).
// The REAL merge/zero-fill/pagination computation this used to assert
// on directly is still covered below, against the pure functions
// themselves (runMetrics/performJoin/paginateGroups, all exported for
// exactly this reason) — same real logic, just verified one layer in.
describe("database_engine.execute_query — metrics mode (several measures, same groupBy, merged)", () => {
  it("the handler returns real metadata (not raw rows) once metrics resolve", async () => {
    (systemConnector.aggregate as jest.Mock)
      .mockResolvedValueOnce({ groups: [{ key: "Acme", value: 2 }, { key: "Globex", value: 1 }] }) // paid_count
      .mockResolvedValueOnce({ groups: [{ key: "Acme", value: 800 }, { key: "Globex", value: 200 }] }); // paid_amount

    const result: any = await run({
      entityKey: "sales_invoice",
      groupBy: "customer",
      metrics: [
        { name: "paid_count", op: "count", filters: { status: "Paid" } },
        { name: "paid_amount", op: "sum", field: "total", filters: { status: "Paid" } },
      ],
    });

    expect(result.rowCount).toBe(2);
    expect(result.columns).toEqual(expect.arrayContaining(["key", "paid_count", "paid_amount"]));
    expect(result.groups).toBeUndefined(); // real per-row values never reach this far
  });

  it("requires groupBy when using metrics", async () => {
    await expect(run({ entityKey: "sales_invoice", metrics: [{ name: "x", op: "count" }] })).rejects.toThrow(/groupBy.*required/);
  });

  it("requires field on a metric unless its own op is count", async () => {
    await expect(
      run({ entityKey: "sales_invoice", groupBy: "customer", metrics: [{ name: "x", op: "sum" }] })
    ).rejects.toThrow(/"field" required/);
  });

  // Real, live-found bug (2026-08-23, interaction_log 3072) — see
  // relayReasoningEngine.ts's own startMultiMetricFetch doc comment for
  // the full "why": this tool's own schema lists op/field/metrics as
  // independent, co-equal properties, so a model reaching for "one
  // total, plus a couple of named counts" in one call (a top-level
  // op/field SIBLING of "metrics") is reading the schema correctly —
  // used to be silently dropped (only "filters" gets read off the top
  // level here). Folded in as its own implicit metric instead.
  it("folds a top-level op/field into its own implicit metric, instead of dropping it", async () => {
    (systemConnector.aggregate as jest.Mock)
      .mockResolvedValueOnce({ groups: [{ key: "Acme", value: 500 }] }) // implicit sum_outstanding_amount metric, runs first
      .mockResolvedValueOnce({ groups: [{ key: "Acme", value: 2 }] }); // count_paid

    const result: any = await run({
      entityKey: "sales_invoice",
      groupBy: "customer",
      op: "sum",
      field: "outstanding_amount",
      metrics: [{ name: "count_paid", op: "count", filters: { status: "Paid" } }],
    });

    expect(result.columns).toEqual(expect.arrayContaining(["sum_outstanding_amount", "count_paid"]));
    expect((systemConnector.aggregate as jest.Mock).mock.calls[0][2]).toEqual(
      expect.objectContaining({ op: "sum", field: "outstanding_amount" })
    );
  });

  it("caps the returned page to the real page size, with real pagination metadata", async () => {
    const manyGroups = Array.from({ length: 25 }, (_, i) => ({ key: `Customer ${i}`, value: 25 - i }));
    (systemConnector.aggregate as jest.Mock).mockResolvedValueOnce({ groups: manyGroups });

    const result: any = await run({
      entityKey: "sales_invoice",
      groupBy: "customer",
      metrics: [{ name: "paid_count", op: "count", filters: { status: "Paid" } }],
    });

    expect(result.rowCount).toBe(25);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(2); // 25 real groups, 20/page
    expect(result.hasMore).toBe(true);
  });
});

// The real merge/zero-fill/sort/cap computation, verified directly
// against the pure function — the handler's own metadata-only return
// (above) can no longer observe this itself.
describe("runMetrics — real merge/zero-fill/sort, independent of the metadata-stripping wrapper", () => {
  it("merges several metrics' own real groups into one combined row per key, real per-group zero-fill", async () => {
    (systemConnector.aggregate as jest.Mock)
      .mockResolvedValueOnce({ groups: [{ key: "Acme", value: 2 }, { key: "Globex", value: 1 }] }) // paid_count
      .mockResolvedValueOnce({ groups: [{ key: "Acme", value: 800 }, { key: "Globex", value: 200 }] }) // paid_amount
      .mockResolvedValueOnce({ groups: [{ key: "Acme", value: 1 }] }); // outstanding_count (Globex absent -> real 0)

    const result = await runMetrics(
      "sales_invoice",
      "customer",
      [
        { name: "paid_count", op: "count", filters: { status: "Paid" } },
        { name: "paid_amount", op: "sum", field: "total", filters: { status: "Paid" } },
        { name: "outstanding_count", op: "count", filters: { outstanding_amount: { op: ">", value: 0 } } },
      ],
      {}
    );

    expect(result.groups).toEqual([
      { key: "Acme", paid_count: 2, paid_amount: 800, outstanding_count: 1 },
      { key: "Globex", paid_count: 1, paid_amount: 200, outstanding_count: 0 },
    ]);
  });

  // Live bug ("every customer's overdue total + count of paid + count of
  // unpaid invoices"): the model set a top-level filter
  // {status:"Overdue", outstanding_amount:{>0}} for the overdue sum, and
  // per-metric filters {status:"Paid"} / {status:"Unpaid"} for the
  // counts. The old merge kept the top-level `outstanding_amount>0`
  // clause on every metric — and a PAID invoice's outstanding IS 0 — so
  // paid_count / unpaid_count came back all-zero.
  it("a metric with its own filters is self-contained — NOT ANDed with the top-level filter", () => {
    const rows = [
      { customer: "Acme", status: "Overdue", outstanding_amount: 500 },
      { customer: "Acme", status: "Overdue", outstanding_amount: 300 },
      { customer: "Acme", status: "Paid", outstanding_amount: 0 },
      { customer: "Acme", status: "Paid", outstanding_amount: 0 },
      { customer: "Acme", status: "Unpaid", outstanding_amount: 120 },
    ];
    const out = aggregateRows(rows, {
      groupBy: "customer",
      filters: { status: "Overdue", outstanding_amount: { op: ">", value: 0 } },
      metrics: [
        { name: "total_due", op: "sum", field: "outstanding_amount" }, // inherits the top-level filter → 800
        { name: "paid_count", op: "count", filters: { status: "Paid" } }, // own filter → 2, NOT 0
        { name: "unpaid_count", op: "count", filters: { status: "Unpaid" } }, // own filter → 1
      ],
    });
    expect(out.groups).toEqual([{ key: "Acme", total_due: 800, paid_count: 2, unpaid_count: 1 }]);
  });

  it("a later page picks up where the real, already-sorted computation left off", async () => {
    const manyGroups = Array.from({ length: 25 }, (_, i) => ({ key: `Customer ${i}`, value: 25 - i }));
    (systemConnector.aggregate as jest.Mock).mockResolvedValueOnce({ groups: manyGroups });

    const result = await runMetrics("sales_invoice", "customer", [{ name: "paid_count", op: "count", filters: { status: "Paid" } }], {}, 2);

    expect(result.groups).toHaveLength(5);
    expect(result.hasMore).toBe(false);
    expect(result.groups[0].key).toBe("Customer 20");
  });
});

describe("paginateGroups — real page cap, never solely reliant on the caller asking for a sane number", () => {
  it("hard-caps pageCount at GROUPS_PAGE_COUNT (20) even if a larger one is requested", () => {
    const groups = Array.from({ length: 30 }, (_, i) => ({ key: `K${i}` }));
    const result = paginateGroups(groups, 1, 5000);
    expect(result.groups).toHaveLength(20);
    expect(result.pageCount).toBe(20);
  });
});

describe("database_engine.execute_query — join mode (combine a second entity's real rows)", () => {
  it("fetches both sides and returns real joined-row metadata (not raw rows)", async () => {
    (systemConnector.list as jest.Mock)
      .mockResolvedValueOnce([{ id: "INV-1", customer: "Acme", total: 100 }]) // left: sales_invoice
      .mockResolvedValueOnce([{ id: "Acme", territory: "North" }]); // right: customer

    const result: any = await run({
      entityKey: "sales_invoice",
      join: { entityKey: "customer", leftKey: "customer", rightKey: "id", fields: ["territory"] },
    });

    expect(result.rowCount).toBe(1);
    expect(result.columns).toEqual(expect.arrayContaining(["id", "customer", "total", "territory"]));
    expect(result.rows).toBeUndefined(); // real row values never reach this far
  });

  it("requires join.entityKey to be a real, known entity", async () => {
    await expect(
      run({ entityKey: "sales_invoice", join: { entityKey: "not_a_real_entity", leftKey: "customer", rightKey: "id" } })
    ).rejects.toThrow(/Unknown entity/);
  });

  it("requires both join.leftKey and join.rightKey", async () => {
    await expect(run({ entityKey: "sales_invoice", join: { entityKey: "customer" } })).rejects.toThrow(/leftKey.*rightKey/);
  });

  // Real, explicit product ask (2026-08-23/24): "possible create two
  // tables join with or N joinnd metriculate" — join now accepts an
  // ARRAY, chaining any number of tables (base -> step1 -> step2 -> ...),
  // not just the original two.
  it("chains a real 3-table join (base -> step1 -> step2), array form", async () => {
    (systemConnector.list as jest.Mock)
      .mockResolvedValueOnce([{ id: "INV-1", customer: "Acme", territory_code: "T1" }]) // base: sales_invoice
      .mockResolvedValueOnce([{ id: "Acme", territory_code: "T1", phone: "555-1234" }]) // step1: customer
      .mockResolvedValueOnce([{ code: "T1", name: "North" }]); // step2: territory

    const result: any = await run({
      entityKey: "sales_invoice",
      join: [
        { entityKey: "customer", leftKey: "customer", rightKey: "id", fields: ["phone", "territory_code"] },
        { entityKey: "territory", leftKey: "territory_code", rightKey: "code", fields: ["name"] },
      ],
    });

    expect(result.rowCount).toBe(1);
    expect(result.columns).toEqual(expect.arrayContaining(["id", "customer", "phone", "name"]));
  });

  // Real, explicit product ask: combining join with groupBy/metrics in
  // ONE call — ERPNext's own native aggregate can't span a joined
  // result, so this runs in-memory over the already joined rows.
  it("combines join with metrics — aggregates the joined rows, real joined fields carry through into each group", async () => {
    (systemConnector.list as jest.Mock)
      .mockResolvedValueOnce([
        { id: "INV-1", customer: "Acme", status: "Paid", outstanding_amount: 0 },
        { id: "INV-2", customer: "Acme", status: "Overdue", outstanding_amount: 500 },
      ]) // base: sales_invoice
      .mockResolvedValueOnce([{ id: "Acme", display_name: "Acme Corp", phone: "555-1234" }]); // join: customer

    const result: any = await run({
      entityKey: "sales_invoice",
      groupBy: "customer",
      metrics: [
        { name: "paid_count", op: "count", filters: { status: "Paid" } },
        { name: "total_overdue", op: "sum", field: "outstanding_amount" },
      ],
      join: [{ entityKey: "customer", leftKey: "customer", rightKey: "id", fields: ["display_name", "phone"] }],
    });

    expect(result.rowCount).toBe(1);
    // Real, explicit product ask (2026-08-24): a join step's own carried
    // field is now aliased under its source entity ("customer_phone",
    // not bare "phone") once combined with aggregation — self-
    // documenting, since it sits next to "key" (the actual group
    // identity) and could otherwise be mistaken for belonging to it.
    expect(result.columns).toEqual(expect.arrayContaining(["key", "customer_display_name", "customer_phone", "paid_count", "total_overdue"]));
  });

  // Real, live-found bug (2026-08-23/24): the join's LAST merge step
  // used to always cap at JOIN_ROW_CAP (200, a DISPLAY limit) — but once
  // combined with metrics/op, aggregation needs EVERY real joined row.
  // Confirmed live: a real 140-customer/~900-invoice join+aggregate
  // silently undercounted any customer whose invoices fell past row
  // 200. This test uses 250 real joined rows (over the 200 cap) for ONE
  // customer and proves the real count is 250, not truncated to 200.
  it("aggregation counts EVERY joined row, never truncated to the display-sized JOIN_ROW_CAP", async () => {
    const manyInvoices = Array.from({ length: 250 }, (_, i) => ({ id: `INV-${i}`, customer: "Acme", status: "Paid" }));
    (systemConnector.list as jest.Mock).mockResolvedValueOnce(manyInvoices).mockResolvedValueOnce([{ id: "Acme", display_name: "Acme Corp" }]);

    const result: any = await run({
      entityKey: "sales_invoice",
      groupBy: "customer",
      metrics: [{ name: "paid_count", op: "count", filters: { status: "Paid" } }],
      join: [{ entityKey: "customer", leftKey: "customer", rightKey: "id", fields: ["display_name"] }],
    });

    expect(result.rowCount).toBe(1); // one real group (one customer)
    // The real count lives one layer deeper than this metadata-only
    // return exposes (by design) — re-derive it the same way
    // aggregateRows itself does, directly, to prove the real math.
    const direct = aggregateRows(
      performJoin(manyInvoices, [{ id: "Acme", display_name: "Acme Corp" }], "customer", "id", undefined, ["display_name"], JOIN_FETCH_CAP).rows,
      { groupBy: "customer", metrics: [{ name: "paid_count", op: "count", filters: { status: "Paid" } }] },
      ["display_name"]
    );
    expect(direct.groups[0].paid_count).toBe(250); // never capped at 200
  });

  // Real, live-found gap (2026-08-23/24, interaction_log 3082): a real
  // "customer" base already has its OWN "phone" field — the model tried
  // joining a whole separate "contact" table just to get it, since a
  // base-entity field with no join step of its own had no way to land
  // in the aggregated output. Top-level "fields" (the base's own
  // requested fields) now carries through too, same real shape as
  // interaction_log 3082: entityKey:"customer" (base, has "phone"
  // natively), joined to sales_invoice for the actual metrics.
  it("a base entity's own field (top-level fields) carries into each group's output row, even though the JOIN is to a different table", async () => {
    (systemConnector.list as jest.Mock)
      .mockResolvedValueOnce([{ id: "CUST-A", display_name: "Acme Corp", phone: "555-1234" }]) // base: customer
      .mockResolvedValueOnce([
        { id: "INV-1", customer: "CUST-A", status: "Paid", outstanding_amount: 0 },
        { id: "INV-2", customer: "CUST-A", status: "Overdue", outstanding_amount: 500 },
      ]); // join: sales_invoice

    const result: any = await run({
      entityKey: "customer",
      fields: ["phone"],
      groupBy: "id",
      metrics: [{ name: "paid_count", op: "count", filters: { status: "Paid" } }],
      join: [{ entityKey: "sales_invoice", leftKey: "id", rightKey: "customer" }],
    });

    expect(result.rowCount).toBe(1);
    expect(result.columns).toEqual(expect.arrayContaining(["key", "phone", "paid_count"]));
  });
});

// performJoin's own real matching logic, independent of the
// metadata-stripping wrapper — same real function the relay's own
// startJoinFetch/continueTurn joinState branch calls directly.
describe("performJoin — real, exact inner join by shared key", () => {
  it("merges only rows that actually match on both sides, real field-collision prefixing", () => {
    const result = performJoin(
      [{ id: "INV-1", customer: "Acme", status: "Paid" }, { id: "INV-2", customer: "NoMatch", status: "Paid" }],
      [{ id: "Acme", status: "Active" }],
      "customer",
      "id"
    );
    expect(result.rows).toEqual([{ id: "INV-1", customer: "Acme", status: "Paid", right_id: "Acme", right_status: "Active" }]);
    expect(result.matchedCount).toBe(1);
    expect(result.leftCount).toBe(2);
    expect(result.rightCount).toBe(1);
  });

  // Real, live-found bug (2026-08-23/24) — confirmed live via real
  // customer paid_count/unpaid_count that never matched more than ONE
  // real invoice, no matter how many the customer actually had: the
  // right side used to be indexed as ONE row per key (a plain Map), so
  // `.set()` on a genuine one-to-many relationship (many invoices
  // sharing the same customer) silently overwrote every earlier match —
  // each left row only ever joined to whichever right row was fetched
  // last. Never caught before because every prior test used a genuine
  // 1:1 relationship on both sides.
  it("a real one-to-many relationship (one customer, several invoices) produces ONE output row per real match, not just the last one", () => {
    const result = performJoin(
      [{ id: "Acme", territory: "North" }], // left: one customer
      [
        { name: "INV-1", customer: "Acme", status: "Paid" },
        { name: "INV-2", customer: "Acme", status: "Overdue" },
        { name: "INV-3", customer: "Acme", status: "Paid" },
      ], // right: three of THEIR real invoices
      "id",
      "customer"
    );
    expect(result.rows).toHaveLength(3); // one row per real invoice, not one row for the whole customer
    expect(result.rows.map((r: any) => r.name)).toEqual(["INV-1", "INV-2", "INV-3"]);
    expect(result.rows.every((r: any) => r.territory === "North")).toBe(true); // the left side's own fields still carry into every one of them
    expect(result.matchedCount).toBe(3);
  });

  it("mixed cardinality — a customer with 3 invoices and a customer with 1 both come out correctly, no cross-contamination", () => {
    const result = performJoin(
      [{ id: "Acme" }, { id: "Globex" }],
      [
        { name: "INV-1", customer: "Acme" },
        { name: "INV-2", customer: "Acme" },
        { name: "INV-3", customer: "Acme" },
        { name: "INV-4", customer: "Globex" },
      ],
      "id",
      "customer"
    );
    expect(result.rows.filter((r: any) => r.id === "Acme")).toHaveLength(3);
    expect(result.rows.filter((r: any) => r.id === "Globex")).toHaveLength(1);
    expect(result.matchedCount).toBe(4);
  });

  // Real, live-found bug (2026-08-24, interaction_log 3105) — confirmed
  // live against real data: many companies have 7-10 real Contact rows
  // each. Chaining customer->contact (enrichment only, fetching a phone
  // number) with customer->sales_invoice (the entity actually being
  // counted) in the SAME join produced a genuine cross-product — 10
  // contacts x 3 real invoices = 30 merged rows for one customer,
  // inflating paid/unpaid counts by that same multiplier. dedupRightPerKey
  // caps a step to its first real match so pure enrichment can never
  // multiply an unrelated aggregation's rows.
  it("dedupRightPerKey caps a one-to-many step to its first match — an enrichment join can't multiply another join's rows", () => {
    const result = performJoin(
      [{ id: "Acme" }],
      [
        { name: "C1", company_name: "Acme", phone: "111" },
        { name: "C2", company_name: "Acme", phone: "222" },
        { name: "C3", company_name: "Acme", phone: "333" },
      ], // three real contacts for the same customer
      "id",
      "company_name",
      undefined,
      ["phone"],
      JOIN_FETCH_CAP,
      true // dedupRightPerKey
    );
    expect(result.rows).toHaveLength(1); // capped to the first real match, not fanned out to all 3
    expect(result.rows[0].phone).toBe("111");
    expect(result.matchedCount).toBe(1);
  });

  it("dedupRightPerKey:false (the default) keeps real fan-out — unaffected, matches the existing one-to-many test above", () => {
    const result = performJoin([{ id: "Acme" }], [{ name: "C1", company_name: "Acme" }, { name: "C2", company_name: "Acme" }], "id", "company_name");
    expect(result.rows).toHaveLength(2);
  });
});

describe("stepFeedsAggregation — decides whether a join step's fields can be safely deduped", () => {
  it("no explicit fields on the step means the WHOLE right row merges in — can't rule anything out, defaults to true", () => {
    expect(stepFeedsAggregation(undefined, { groupBy: "id", metrics: [{ field: "outstanding_amount" }] })).toBe(true);
    expect(stepFeedsAggregation([], { groupBy: "id" })).toBe(true);
  });

  it("explicit fields that groupBy/metrics never reference — safe to dedup", () => {
    expect(stepFeedsAggregation(["phone"], { groupBy: "id", metrics: [{ field: "outstanding_amount", filters: { status: "Paid" } }] })).toBe(false);
  });

  it("explicit fields referenced by groupBy — must keep real fan-out", () => {
    expect(stepFeedsAggregation(["status"], { groupBy: "status", metrics: [{ op: "count" }] })).toBe(true);
  });

  it("explicit fields referenced by a metric's own field — must keep real fan-out", () => {
    expect(stepFeedsAggregation(["outstanding_amount"], { groupBy: "id", metrics: [{ op: "sum", field: "outstanding_amount" }] })).toBe(true);
  });

  it("explicit fields referenced only by a metric's own filter key — must keep real fan-out", () => {
    expect(stepFeedsAggregation(["status"], { groupBy: "id", metrics: [{ op: "count", filters: { status: "Paid" } }] })).toBe(true);
  });

  it("explicit fields referenced by the top-level plain op/field/filters shape (no metrics array) — must keep real fan-out", () => {
    expect(stepFeedsAggregation(["outstanding_amount"], { groupBy: "id", op: "sum", field: "outstanding_amount" })).toBe(true);
    expect(stepFeedsAggregation(["status"], { groupBy: "id", filters: { status: "Paid" } })).toBe(true);
  });
});

// buildExecuteQueryMetadata's own real derivation, unit-tested directly
// — the handler tests above only prove it gets CALLED; this proves it
// derives the right shape for each of the three real result shapes.
describe("buildExecuteQueryMetadata — real derivation per result shape", () => {
  it("groups shape (metrics/groupBy) -> rowCount/columns/page/totalPages/hasMore", () => {
    const meta = buildExecuteQueryMetadata(
      { groups: [{ key: "Acme", paid_count: 2 }], totalGroups: 25, pageIndex: 1, pageCount: 20, hasMore: true },
      {}
    );
    expect(meta).toEqual({ rowCount: 25, columns: ["key", "paid_count"], aggregates: {}, page: 1, totalPages: 2, hasMore: true, query: {} });
  });

  it("rows shape (join) -> rowCount/columns/hasMore from matchedCount/truncated", () => {
    const meta = buildExecuteQueryMetadata({ rows: [{ id: "INV-1", customer: "Acme" }], matchedCount: 1, truncated: false }, {});
    expect(meta).toEqual({ rowCount: 1, columns: ["id", "customer"], aggregates: {}, page: 1, totalPages: 1, hasMore: false, query: {} });
  });

  it("plain scalar shape (op, no groupBy) -> rowCount/aggregates from overall", () => {
    const meta = buildExecuteQueryMetadata({ overall: { value: 500, count: 3 } }, { op: "sum", field: "total" });
    expect(meta).toEqual({ rowCount: 3, columns: [], aggregates: { sum_total: 500 }, page: 1, totalPages: 1, hasMore: false, query: { op: "sum", field: "total" } });
  });

  it("an already-stripped shape passes through unchanged — safe to call more than once", () => {
    const already = { rowCount: 1, columns: ["a"], aggregates: {}, page: 1, totalPages: 1, hasMore: false };
    expect(buildExecuteQueryMetadata(already, {})).toBe(already);
  });

  // Real, live-found bug (2026-08-23/24, interaction_log 3080): a real
  // join silently matched zero rows (a wrong leftKey/rightKey — no
  // error, the mismatched key just never existed on any row) and the
  // model confidently reported "no records available" for a tenant that
  // very much has records. A join-involved zero-row result now carries a
  // real note telling the model to recheck the query instead.
  describe("zero-rows join note — only fires when a join was actually involved", () => {
    it("a join that matched zero rows gets a real recheck note", () => {
      const meta = buildExecuteQueryMetadata({ rows: [], matchedCount: 0, truncated: false }, { join: [{ entityKey: "customer", leftKey: "x", rightKey: "id" }] });
      expect(meta._note).toMatch(/0 rows matched/);
      expect(meta._note).toMatch(/recheck the query/i);
    });

    it("a plain filtered query (no join) with zero rows gets NO note — genuinely empty data is normal", () => {
      const meta = buildExecuteQueryMetadata({ overall: { value: 0, count: 0 } }, { op: "count" });
      expect(meta._note).toBeUndefined();
    });

    it("a join that DID match real rows gets no note either", () => {
      const meta = buildExecuteQueryMetadata({ rows: [{ id: "A" }], matchedCount: 1, truncated: false }, { join: [{ entityKey: "customer", leftKey: "customer", rightKey: "id" }] });
      expect(meta._note).toBeUndefined();
    });
  });
});

// aggregateRows' own real in-memory group/aggregate math, unit-tested
// directly — the handler tests above only prove it gets CALLED with
// joined rows; this proves the actual computed values (and the real
// filter-op vocabulary: equality/like/in/>/</between/relative) are
// correct, same as ERPNext's own native aggregate would produce.
describe("aggregateRows — real in-memory group/aggregate over already-fetched (joined) rows", () => {
  const rows = [
    { customer: "Acme", status: "Paid", outstanding_amount: 0, display_name: "Acme Corp" },
    { customer: "Acme", status: "Overdue", outstanding_amount: 300, display_name: "Acme Corp" },
    { customer: "Globex", status: "Overdue", outstanding_amount: 200, display_name: "Globex Inc" },
  ];

  it("groupBy + metrics: real per-group values, real zero-fill for a metric with no matching rows in that group", () => {
    const result = aggregateRows(rows, {
      groupBy: "customer",
      metrics: [
        { name: "paid_count", op: "count", filters: { status: "Paid" } },
        { name: "total_overdue", op: "sum", field: "outstanding_amount", filters: { status: "Overdue" } },
      ],
    });
    expect(result.groups).toEqual(
      expect.arrayContaining([
        { key: "Acme", paid_count: 1, total_overdue: 300 },
        { key: "Globex", paid_count: 0, total_overdue: 200 }, // no Paid rows at all for Globex -> real 0, never missing
      ])
    );
  });

  // Real, live-found bug (2026-08-24, interaction_log 3137): a join
  // step's own "filters" (e.g. outstanding_amount>0) already excludes
  // every Paid row (outstanding_amount=0) BEFORE aggregateRows ever
  // sees them — the rows passed in here simulate that: no "Paid" row
  // exists at all, exactly what a real join-step pre-filter produces.
  it("flags a metric with its own filters that came back 0 for EVERY group while another metric is non-zero — the exact live bug", () => {
    const preFilteredRows = [
      { customer: "Acme", status: "Overdue", outstanding_amount: 300 },
      { customer: "Globex", status: "Overdue", outstanding_amount: 200 },
    ];
    const result = aggregateRows(preFilteredRows, {
      groupBy: "customer",
      metrics: [
        { name: "paid_count", op: "count", filters: { status: "Paid" } },
        { name: "unpaid_count", op: "count", filters: { status: "Overdue" } },
        { name: "total_overdue", op: "sum", field: "outstanding_amount" },
      ],
    });
    // Real, live-found reversal (2026-08-24, later same day): the old
    // per-metric "one metric 0 while another is non-zero" note was
    // replaced by a much simpler "every metric 0" check (no long
    // explanatory prose to the model) — this scenario has 2 non-zero
    // metrics (unpaid_count, total_overdue), so no note fires at all
    // now; the real computed value (0, a join-step pre-filter case this
    // function alone can't see/fix) still reaches the model either way.
    // This exact case IS now fixed at the top-level-filters layer — see
    // "a metric's own filters OVERRIDE..." below — this test's rows
    // simulate a join-step pre-filter instead, still not covered.
    expect(result.groups).toEqual(
      expect.arrayContaining([
        { key: "Acme", paid_count: 0, unpaid_count: 1, total_overdue: 300 },
        { key: "Globex", paid_count: 0, unpaid_count: 1, total_overdue: 200 },
      ])
    );
    expect(result._note).toBeUndefined();
  });

  // Real, live-found bug (2026-08-24, recurred all day, interaction_log
  // 3152 is the exact shape): a real live query used a TOP-LEVEL
  // args.filters ({"status":"Overdue"}) while also asking for a
  // "Paid" count via a metric's own filters — structurally guaranteed
  // 0 under the OLD always-AND behavior. Real structural fix: a
  // metric's own filters WIN on a colliding key, computed against the
  // FULL rows for that group (not the top-level-narrowed subset).
  it("a metric's own filters OVERRIDE a colliding top-level args.filters key, computed from the full rows — the exact live bug (interaction_log 3152)", () => {
    const allRows = [
      { customer: "Acme", status: "Overdue", outstanding_amount: 300 },
      { customer: "Acme", status: "Paid", outstanding_amount: 0 },
      { customer: "Acme", status: "Paid", outstanding_amount: 0 },
      { customer: "Globex", status: "Overdue", outstanding_amount: 200 },
      { customer: "Globex", status: "Paid", outstanding_amount: 0 },
    ];
    const result = aggregateRows(allRows, {
      groupBy: "customer",
      filters: { status: "Overdue" }, // the exact real top-level shape that broke live
      metrics: [
        { name: "total_overdue_amount", op: "sum", field: "outstanding_amount" }, // no filter of its own — stays scoped to Overdue, unaffected
        { name: "overdue_count", op: "count" },
        { name: "paid_count", op: "count", filters: { status: "Paid" } }, // its own filter collides with the top-level key — must win
      ],
    });
    expect(result.groups).toEqual(
      expect.arrayContaining([
        { key: "Acme", total_overdue_amount: 300, overdue_count: 1, paid_count: 2 }, // real, correct — no longer a structurally-forced 0
        { key: "Globex", total_overdue_amount: 200, overdue_count: 1, paid_count: 1 },
      ])
    );
  });

  it("does NOT flag a metric that's genuinely, correctly 0 in only SOME groups (not every group)", () => {
    const result = aggregateRows(rows, {
      groupBy: "customer",
      metrics: [
        { name: "paid_count", op: "count", filters: { status: "Paid" } },
        { name: "total_overdue", op: "sum", field: "outstanding_amount", filters: { status: "Overdue" } },
      ],
    });
    // Globex has paid_count:0 (real, correct — Globex just has no Paid
    // invoices), but Acme's paid_count:1 is real and non-zero — not
    // EVERY group is 0, so this must never be flagged as suspicious.
    expect(result._note).toBeUndefined();
  });

  it("carryFields ride along into each group's own output row, constant within the group", () => {
    const result = aggregateRows(rows, { groupBy: "customer", metrics: [{ name: "n", op: "count" }] }, ["display_name"]);
    expect(result.groups).toEqual(
      expect.arrayContaining([
        { key: "Acme", display_name: "Acme Corp", n: 2 },
        { key: "Globex", display_name: "Globex Inc", n: 1 },
      ])
    );
  });

  it("groupBy + plain op (no metrics array): same {key,value,count} shape systemConnector.aggregate produces", () => {
    const result = aggregateRows(rows, { groupBy: "customer", op: "sum", field: "outstanding_amount" });
    expect(result.groups).toEqual(
      expect.arrayContaining([
        { key: "Acme", value: 300, count: 2 },
        { key: "Globex", value: 200, count: 1 },
      ])
    );
  });

  it("no groupBy: a plain scalar {overall:{value,count}}, same shape as an ungrouped native aggregate", () => {
    const result = aggregateRows(rows, { op: "count" });
    expect(result).toEqual({ overall: { value: 3, count: 3 } });
  });

  it("top-level filters narrow the rows BEFORE grouping — the exact live bug class already fixed for runMetrics, same guard here", () => {
    const result = aggregateRows(rows, { groupBy: "customer", op: "count", filters: { status: "Overdue" } });
    expect(result.groups).toEqual(expect.arrayContaining([{ key: "Acme", value: 1, count: 1 }, { key: "Globex", value: 1, count: 1 }]));
  });

  it("real filter ops: like/in/>/</between all match correctly", () => {
    const priceRows = [{ id: "A", name: "Widget Pro", price: 50 }, { id: "B", name: "Gadget", price: 150 }, { id: "C", name: "Widget Lite", price: 250 }];
    expect(aggregateRows(priceRows, { op: "count", filters: { name: { op: "like", value: "%Widget%" } } }).overall.value).toBe(2);
    expect(aggregateRows(priceRows, { op: "count", filters: { id: { op: "in", value: ["A", "B"] } } }).overall.value).toBe(2);
    expect(aggregateRows(priceRows, { op: "count", filters: { price: { op: ">", value: 100 } } }).overall.value).toBe(2);
    expect(aggregateRows(priceRows, { op: "count", filters: { price: { op: "<", value: 100 } } }).overall.value).toBe(1);
    expect(aggregateRows(priceRows, { op: "count", filters: { price: { op: "between", value: [100, 200] } } }).overall.value).toBe(1);
  });
});
