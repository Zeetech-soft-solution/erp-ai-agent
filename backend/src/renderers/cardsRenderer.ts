import { rendererRegistry, renderNextSteps } from "../core/rendererRegistry";
import { DisplayIntent } from "../core/types";
import { escapeHtml } from "./escape";

// Same object/array cell-value guard as tableRenderer.ts's own cellText —
// see that file's doc comment for the "[object Object]" bug this avoids.
function cellText(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * A single record's full-detail view — one label:value row per field,
 * stacked vertically. Used for a genuine single *.get() result (one
 * quotation, one customer, ...) — see reasoningEngine.ts's own
 * isSingleRecord doc comment for why that decision is made
 * deterministically there, never left to the model's own DISPLAY_INTENT
 * choice.
 *
 * Previously "cards" was just an alias for renderTable (a one-row
 * table) with a "TODO: distinct card layout later" — confirmed that's a
 * genuinely worse read for a record with many fields: a quotation or
 * customer easily has 8+ fields, which as a table means either an
 * illegibly dense single row or heavy horizontal scrolling just to see
 * every column header stacked above one value each. A vertical
 * label:value list needs no scrolling and reads the way every other
 * "detail view" (as opposed to "list view") already does elsewhere.
 *
 * `data` is normally a single bare object (that's what a real *.get()
 * always returns — see erpnextConnector.ts's get(): Promise<any> vs
 * list(): Promise<any[]>), but this also accepts an array defensively
 * (renders one stacked card per record) rather than assume the shape.
 */
function renderCards(data: any, intent: DisplayIntent): string {
  const records: Record<string, any>[] = Array.isArray(data) ? data : [data];
  if (!records.length || !records[0]) return `<div class="erp-agent-empty">No record found.</div>`;

  const cards = records
    .map((record) => {
      const rows = Object.entries(record)
        .map(
          ([key, value]) => `
      <div class="erp-agent-card-row">
        <div class="erp-agent-card-label">${escapeHtml(key)}</div>
        <div class="erp-agent-card-value">${escapeHtml(cellText(value)) || "—"}</div>
      </div>`
        )
        .join("");
      return `<div class="erp-agent-card">${rows}\n    </div>`;
    })
    .join("\n  ");

  return `
<div class="erp-agent-report">
  ${cards}
  ${renderNextSteps(intent)}
</div>`.trim();
}

rendererRegistry.register("cards", renderCards);
