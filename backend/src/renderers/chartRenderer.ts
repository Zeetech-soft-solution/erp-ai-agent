import { rendererRegistry, renderNextSteps } from "../core/rendererRegistry";
import { DisplayIntent } from "../core/types";
import { escapeHtml } from "./escape";

// Same object/array cell-value guard as tableRenderer.ts/cardsRenderer.ts's
// own cellText — see tableRenderer.ts's doc comment for the "[object
// Object]" bug this avoids.
function cellText(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Checked in this order because a status-like field is what "graph of
// leads/quotations/tickets/..." almost always means in practice (confirmed
// live 2026-08-13: "give me graph of todays lead" on a 3-row crm.list_leads
// result — the obvious read is "how many of each status", not one bar per
// record). Falls through to any other low-cardinality field below for
// entities with none of these column names.
const PREFERRED_GROUP_FIELDS = ["status", "source", "priority", "department", "warehouse", "category", "designation"];

/**
 * Picks whichever column looks most like a real category to group-and-count
 * by — a bar chart's x-axis. Requires more than one distinct value (a
 * single-value column makes every bar identical, saying nothing), no more
 * than 12 (otherwise a free-text field would turn "one bar per category"
 * into "one bar per row", which is a table, not a chart), and no nulls (a
 * column that's sometimes missing isn't a clean category). Returns null
 * when nothing in the data qualifies.
 */
function pickGroupField(rows: Record<string, any>[]): string | null {
  const columns = Object.keys(rows[0] || {});
  const candidates = columns
    .filter((c) => rows.every((r) => typeof r[c] !== "object" || r[c] === null))
    .map((c) => {
      const values = rows.map((r) => cellText(r[c])).filter(Boolean);
      return { column: c, distinctCount: new Set(values).size, filled: values.length };
    })
    .filter((c) => c.distinctCount > 1 && c.distinctCount <= 12 && c.filled === rows.length);

  if (!candidates.length) return null;
  for (const preferred of PREFERRED_GROUP_FIELDS) {
    const hit = candidates.find((c) => c.column === preferred);
    if (hit) return hit.column;
  }
  // No named field matched — an arbitrary column (e.g. "id"/"email") is
  // only trustworthy as a category if at least one value repeats. Without
  // that extra guard, a small enough row count makes an identifier column
  // look "low-cardinality" too (2 rows, 2 unique emails passes the >1/<=12
  // check above just as easily as a real category would) even though it's
  // one bar per row, not a real distribution. A named field skips this
  // check — its meaning is already known, an all-unique "status" on a
  // handful of rows is still a real (if flat) distribution worth charting.
  const repeated = candidates.filter((c) => c.distinctCount < rows.length);
  if (!repeated.length) return null;
  // The column with the fewest distinct values reads as the most
  // "categorical" one, closest to a usable x-axis.
  return repeated.sort((a, b) => a.distinctCount - b.distinctCount)[0].column;
}

/**
 * Generic "count by category" bar chart — works for any array-of-objects
 * tool result the same way tableRenderer/cardsRenderer do, by inferring the
 * grouping column instead of needing a per-doctype template. Always exactly
 * one series (a count), so one hue (the app's own --accent) throughout —
 * a legend/multi-hue categorical palette is only needed to tell multiple
 * SERIES apart, and there's only ever one series here.
 *
 * Falls back to the table renderer when there's no column worth grouping
 * by (e.g. every row is already unique) rather than ship a chart that
 * would just be one identical-looking bar per row — same defensive-
 * fallback spirit as cardsRenderer's array handling.
 */
function renderChart(data: any, intent: DisplayIntent): string {
  const rows: Record<string, any>[] = Array.isArray(data) ? data : [data];
  if (!rows.length || !rows[0]) return `<div class="erp-agent-empty">No records found.</div>`;

  const groupField = rows.length > 1 ? pickGroupField(rows) : null;
  if (!groupField) return rendererRegistry.render("table", data, intent);

  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = cellText(row[groupField]) || "(none)";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, n]) => n));

  const barsHtml = entries
    .map(([label, count]) => {
      // Floored so a count of 1 next to a much larger bar is still a
      // visibly nonzero bar, not a sliver.
      const pct = Math.max((count / max) * 100, 4);
      return `
      <div class="erp-agent-chart-row">
        <div class="erp-agent-chart-label">${escapeHtml(label)}</div>
        <div class="erp-agent-chart-track">
          <div class="erp-agent-chart-bar" style="width:${pct}%" title="${escapeHtml(label)}: ${count}"></div>
        </div>
        <div class="erp-agent-chart-value">${count}</div>
      </div>`;
    })
    .join("");

  return `
<div class="erp-agent-report">
  <div class="erp-agent-chart" role="img" aria-label="Count of ${rows.length} records by ${escapeHtml(groupField)}">
    ${barsHtml}
  </div>
  ${renderNextSteps(intent)}
</div>`.trim();
}

rendererRegistry.register("chart", renderChart);
