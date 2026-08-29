import { rendererRegistry, renderNextSteps } from "../core/rendererRegistry";
import { DisplayIntent } from "../core/types";
import { escapeHtml } from "./escape";

/**
 * Confirmed live 2026-08-12: a "top customers by amount owed" reply
 * showed literal "[object Object]" text to the user. A table cell whose
 * value is itself a nested object/array (e.g. a Link field ERPNext
 * expanded, or an analytics.aggregate group row with an object member)
 * hit plain `String(value)` below, which is JS's default object-to-
 * string coercion — it does NOT call JSON.stringify, it always produces
 * the literal, useless string "[object Object]" (or "[object Array]"
 * isn't even distinguished — arrays stringify to their joined values,
 * a different but equally wrong-looking cell). Cheap to guard here once
 * rather than trust every caller to only ever hand this renderer
 * flat-scalar rows.
 */
function cellText(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Generic table renderer — works for any array-of-objects tool result
 *  (leads, opportunities, customers, tickets...). Columns are inferred
 *  from the keys of the first row so no per-doctype template is needed. */
function renderTable(data: any, intent: DisplayIntent): string {
  const rows: Record<string, any>[] = Array.isArray(data) ? data : [data];
  if (!rows.length) return `<div class="erp-agent-empty">No records found.</div>`;

  const allColumns = Object.keys(rows[0]);
  // Real, common rendering fix (see DisplayIntent.columns's own doc
  // comment): when the question only cares about a few fields, show
  // only those — never silently drop "id" even if the model forgot to
  // list it, since that's the row's own clickable link, "as usual".
  // An intent.columns entry that doesn't actually exist on this row is
  // just ignored (never a blank/broken column) rather than throw.
  const requestedColumns = intent.columns?.length
    ? [...new Set(["id", ...intent.columns])].filter((c) => allColumns.includes(c))
    : allColumns;
  // Real bug found live 2026-08-18: the model named canonical fields
  // that don't actually exist on this entity (guessed "company"/"price"
  // instead of this row's real "party"/"total") — every one of them got
  // filtered out above, leaving a table with ONLY the id column. That's
  // a worse result than not filtering at all, not a smaller-but-correct
  // one. If fewer than 2 real columns survived (id alone carries no
  // actual data), fall back to showing every column rather than an
  // effectively-empty table — same "a clearly-wrong model hint should
  // degrade gracefully, not amplify into something worse" reasoning as
  // rendererRegistry.render()'s own try/catch raw-fallback.
  const columns = requestedColumns.length >= 2 ? requestedColumns : allColumns;
  const highlight = new Set(intent.highlight || []);
  // Confirmed live 2026-08-12: users want a row's own id to be directly
  // clickable into that record's details, instead of a separate generic
  // "view details" button below the table (still model-generated, still
  // unreliable — the actually distinct actions like "Convert to Sales
  // Order" or "Get PDF" stay in next_steps below; this covers the
  // universal "show me this one" case deterministically for every
  // entity, no per-doctype wiring needed). Reuses the exact same click
  // delegation ResponseView.tsx already wires for .erp-agent-next-step
  // (data-action -> onNextStep) — just anchored to the id cell itself.
  // "id" is the canonical field name for every entity; "name" covers
  // the handful of raw ERPNext-shaped report rows that skip canonical
  // mapping — same fallback already used for row-highlight matching.
  // "key" (2026-08-24, explicit product ask — "let the first column be
  // the link... like this case customer") is a real, general THIRD
  // case: aggregateRows' own grouped output always names its group
  // identity column "key" (never "id"/"name" literally), so a real
  // join+groupBy/metrics result's own first column — the actual
  // customer/entity being grouped by — never became clickable before,
  // same real capability every plain (ungrouped) table already had.
  const idColumn = columns.includes("id") ? "id" : columns.includes("name") ? "name" : columns.includes("key") ? "key" : null;

  const head = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = rows
    .map((row) => {
      const id = row.name || row.id || row.key || "";
      const cls = highlight.has(id) ? ' class="erp-agent-row-highlight"' : "";
      const cells = columns
        .map((c) => {
          const value = escapeHtml(cellText(row[c]));
          if (c === idColumn && id) {
            // See DisplayIntent.entityKey's own doc comment — a grouped/
            // joined table's group identity ("key") is genuinely
            // ambiguous without this; a plain .list/.get's own "id"/
            // "name" column already reads unambiguously, entityKey is
            // typically omitted there.
            const action = escapeHtml(intent.entityKey ? `Show full details of the ${intent.entityKey} "${id}"` : `Show full details of ${id}`);
            return `<td><button type="button" class="erp-agent-next-step erp-agent-row-id-link" data-action="${action}">${value}</button></td>`;
          }
          return `<td>${value}</td>`;
        })
        .join("");
      return `<tr${cls}>${cells}</tr>`;
    })
    .join("");

  return `
<div class="erp-agent-report">
  <div class="erp-agent-table-scroll">
    <table class="erp-agent-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </div>
  ${renderNextSteps(intent)}
</div>`.trim();
}

rendererRegistry.register("table", renderTable);
// "cards" has its own distinct renderer now — see cardsRenderer.ts.
