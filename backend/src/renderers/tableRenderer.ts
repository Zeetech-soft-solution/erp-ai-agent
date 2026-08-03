import { rendererRegistry, renderNextSteps } from "../core/rendererRegistry";
import { DisplayIntent } from "../core/types";
import { escapeHtml } from "./escape";

/** Generic table renderer — works for any array-of-objects tool result
 *  (leads, opportunities, customers, tickets...). Columns are inferred
 *  from the keys of the first row so no per-doctype template is needed. */
function renderTable(data: any, intent: DisplayIntent): string {
  const rows: Record<string, any>[] = Array.isArray(data) ? data : [data];
  if (!rows.length) return `<div class="erp-agent-empty">No records found.</div>`;

  const columns = Object.keys(rows[0]);
  const highlight = new Set(intent.highlight || []);

  const head = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = rows
    .map((row) => {
      const id = row.name || row.id || "";
      const cls = highlight.has(id) ? ' class="erp-agent-row-highlight"' : "";
      const cells = columns.map((c) => `<td>${escapeHtml(String(row[c] ?? ""))}</td>`).join("");
      return `<tr${cls}>${cells}</tr>`;
    })
    .join("");

  return `
<div class="erp-agent-report">
  <table class="erp-agent-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  ${renderNextSteps(intent)}
</div>`.trim();
}

rendererRegistry.register("table", renderTable);
rendererRegistry.register("cards", renderTable); // TODO: distinct card layout later
