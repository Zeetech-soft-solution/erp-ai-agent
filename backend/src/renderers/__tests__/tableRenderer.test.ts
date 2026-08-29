import "../tableRenderer";
import { rendererRegistry } from "../../core/rendererRegistry";
import { DisplayIntent } from "../../core/types";

// Confirmed live 2026-08-12: users want a row's own id clickable straight
// into that record's details instead of a separate generic "view details"
// button — this suite locks in the id cell becoming a real clickable
// element (same .erp-agent-next-step click wiring the bottom button row
// already uses) while everything else about the table stays unchanged.
describe("table renderer — clickable row id", () => {
  const intent: DisplayIntent = { render: "table" };

  it("wraps the id column's cell in a .erp-agent-next-step button with a details action", () => {
    const html = rendererRegistry.render("table", [{ id: "SAL-QTN-2026-00014", customer: "Acme" }], intent);
    expect(html).toContain('class="erp-agent-next-step erp-agent-row-id-link"');
    expect(html).toContain('data-action="Show full details of SAL-QTN-2026-00014"');
    expect(html).toContain(">SAL-QTN-2026-00014</button>");
  });

  it("falls back to a 'name' column when there's no 'id' column (raw ERPNext-shaped rows)", () => {
    const html = rendererRegistry.render("table", [{ name: "ACC-PINV-2026-00292", status: "Unpaid" }], intent);
    expect(html).toContain('data-action="Show full details of ACC-PINV-2026-00292"');
  });

  it("leaves every other column as a plain, non-clickable cell", () => {
    const html = rendererRegistry.render("table", [{ id: "SAL-QTN-2026-00014", customer: "Acme" }], intent);
    expect(html).toContain("<td>Acme</td>");
  });

  it("does not add a clickable id when neither 'id' nor 'name' is present", () => {
    const html = rendererRegistry.render("table", [{ customer: "Acme", total: 100 }], intent);
    expect(html).not.toContain("erp-agent-row-id-link");
  });

  it("still renders model-supplied next_steps below the table (distinct actions stay)", () => {
    const html = rendererRegistry.render("table", [{ id: "SAL-QTN-2026-00014", customer: "Acme" }], {
      render: "table",
      next_steps: ["Convert SAL-QTN-2026-00014 to Sales Order"],
    });
    expect(html).toContain('data-action="Convert SAL-QTN-2026-00014 to Sales Order"');
  });

  // Real, explicit product ask (2026-08-24): "let the first column be
  // the link... like this case customer" — aggregateRows' own grouped
  // output always names its group identity column "key" (never
  // "id"/"name" literally, e.g. a real join+groupBy/metrics result), so
  // it never became clickable before — same real capability a plain
  // table's own "id"/"name" column already had.
  it("falls back to a 'key' column (a real grouped/aggregated result's own group identity) when there's no 'id' or 'name'", () => {
    const html = rendererRegistry.render("table", [{ key: "Aditya Components & Co", paid_count: 4, total_overdue: 378432 }], intent);
    expect(html).toContain('class="erp-agent-next-step erp-agent-row-id-link"');
    expect(html).toContain('data-action="Show full details of Aditya Components &amp; Co"');
    expect(html).toContain(">Aditya Components &amp; Co</button>");
    expect(html).toContain("<td>4</td>"); // every other column stays a plain cell
  });

  it("'id'/'name' still win over 'key' when a row genuinely has more than one candidate", () => {
    const html = rendererRegistry.render("table", [{ id: "CUST-001", key: "Acme Corp", total: 100 }], intent);
    expect(html).toContain('data-action="Show full details of CUST-001"');
    expect(html).not.toContain('data-action="Show full details of Acme Corp"');
  });

  // Real, live-found bug (2026-08-24, interaction_log 6a3b615a and
  // others): a real "Show full details of Aditya Components & Co" click
  // made the model try tools.search, then communication.get — both wrong
  // guesses — before finally landing on customer.list, because the
  // action text alone gave zero indication this was a customer record.
  // DisplayIntent.entityKey lets the caller (relayReasoningEngine.ts's
  // renderGroupsPage) supply the real category so the very next turn's
  // own prompt already says what kind of record this is.
  it("embeds intent.entityKey into the action text for a grouped/joined table's own 'key' column", () => {
    const html = rendererRegistry.render(
      "table",
      [{ key: "Aditya Components & Co", paid_count: 4, total_overdue: 378432 }],
      { ...intent, entityKey: "customer" }
    );
    expect(html).toContain('data-action="Show full details of the customer &quot;Aditya Components &amp; Co&quot;"');
  });
});

// Real, common rendering fix found live 2026-08-18: "list quotations by
// company name and price" always got every canonical column (status,
// date, valid_till, owner, modified — none asked about) — see
// DisplayIntent.columns's own doc comment for the full "why".
describe("table renderer — DisplayIntent.columns (show only what was asked)", () => {
  const row = { id: "SAL-QTN-2026-00014", party: "Acme Co", status: "Open", total: 5000, date: "2026-08-01" };

  it("shows only the requested columns, plus id (always included)", () => {
    const html = rendererRegistry.render("table", [row], { render: "table", columns: ["party", "total"] });
    expect(html).toContain("<th>id</th>");
    expect(html).toContain("<th>party</th>");
    expect(html).toContain("<th>total</th>");
    expect(html).not.toContain("<th>status</th>");
    expect(html).not.toContain("<th>date</th>");
  });

  it("id is included even if the model didn't list it itself", () => {
    const html = rendererRegistry.render("table", [row], { render: "table", columns: ["party"] });
    expect(html).toContain("<th>id</th>");
    // still the real clickable row-id link, not just a plain column
    expect(html).toContain("erp-agent-row-id-link");
  });

  it("omitting columns entirely shows every field, same as before this existed", () => {
    const html = rendererRegistry.render("table", [row], { render: "table" });
    expect(html).toContain("<th>status</th>");
    expect(html).toContain("<th>date</th>");
  });

  it("a nonexistent column name is silently dropped, not shown blank", () => {
    const html = rendererRegistry.render("table", [row], { render: "table", columns: ["party", "company_name"] });
    expect(html).toContain("<th>party</th>");
    expect(html).not.toContain("<th>company_name</th>");
  });

  it("real bug found live: if the model gets EVERY name wrong (only id survives), fall back to showing every column rather than an effectively-empty table", () => {
    const html = rendererRegistry.render("table", [row], { render: "table", columns: ["company", "price"] });
    // Neither real column name -> only "id" would have survived the
    // filter -> falls back to showing everything instead.
    expect(html).toContain("<th>status</th>");
    expect(html).toContain("<th>total</th>");
    expect(html).toContain("<th>party</th>");
  });
});

// Confirmed live 2026-08-12: a table cell whose value was itself a nested
// object/array rendered as the literal text "[object Object]" — plain
// `String(value)` is JS's default toString() coercion, not JSON.stringify,
// and always collapses any plain object to that one useless string.
describe("table renderer — nested object/array cell values", () => {
  const intent: DisplayIntent = { render: "table" };

  it("stringifies a nested object cell as real JSON instead of '[object Object]'", () => {
    const html = rendererRegistry.render("table", [{ id: "X", contact: { name: "Acme", email: "a@acme.com" } }], intent);
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Acme");
  });

  it("leaves a null/undefined cell as an empty cell, not the string 'null'/'undefined'", () => {
    const html = rendererRegistry.render("table", [{ id: "X", note: null }], intent);
    expect(html).not.toContain(">null<");
    expect(html).not.toContain(">undefined<");
  });
});
