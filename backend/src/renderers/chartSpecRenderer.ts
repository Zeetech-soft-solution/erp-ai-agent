import { renderNextSteps } from "../core/rendererRegistry";
import { DisplayIntent } from "../core/types";
import { ChartSpec } from "../core/chartSpecBuilder";
import { escapeHtml } from "./escape";

/**
 * Renders a chart.build ChartSpec (see core/chartSpecBuilder.ts) to real
 * server-side HTML — same zero-dependency, zero-JS-library approach as
 * the existing bar-chart renderer (renderers/chartRenderer.ts). Bar rows
 * reuse that file's already-deployed CSS classes (.erp-agent-chart /
 * -row / -label / -track / -bar / -value) so a bar/multi-series-bar
 * chart needs no frontend redeploy at all. Everything new (chart title,
 * legend, pie/donut, the line chart's inline SVG) is styled with INLINE
 * styles rather than new CSS classes, for the same reason — this file
 * can ship as a backend-only change. Where a value needs the app's own
 * theme, it references the app's existing CSS custom properties (var(
 * --ink) etc., defined in frontend/agent/src/styles.css's :root — never
 * new ones); the couple of chrome greys used inside inline SVG are
 * hardcoded to that same stylesheet's current hex values instead (SVG's
 * var() support for presentation attributes is less consistent across
 * browsers than plain HTML/CSS, not worth the risk for two hairline
 * colors that rarely change).
 *
 * NOT registered in rendererRegistry — unlike every other renderer here,
 * this isn't selected by a DISPLAY_INTENT.render string; reasoningEngine.ts
 * calls renderChartDashboard() directly once it sees one or more
 * chart.build results in a turn (see its own comment for why that's a
 * deliberately different, ungated pathway, same reasoning as the
 * data?.document check that also bypasses DISPLAY_INTENT).
 */

const CHROME_MUTED_INK = "#9BA098"; // styles.css --ink-muted
const CHROME_BORDER = "#E3E4DF"; // styles.css --border
const CHROME_INK = "#1B1E1C"; // styles.css --ink
const CHROME_INK_SECONDARY = "#6B7268"; // styles.css --ink-secondary
const CHROME_SURFACE = "#FFFFFF"; // styles.css --bg-surface
const CHROME_BG_PAGE = "#F5F6F3"; // styles.css --bg-page

function fmtNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function renderTitle(title: string): string {
  return `<div style="font-weight:600;font-size:13px;color:var(--ink,${CHROME_INK});margin-bottom:10px">${escapeHtml(title)}</div>`;
}

function renderLegend(items: { label: string; color: string }[]): string {
  if (items.length < 2) return "";
  const chips = items
    .map(
      (it) => `
    <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--ink-secondary,${CHROME_INK_SECONDARY});margin:0 12px 6px 0">
      <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${it.color};flex-shrink:0"></span>${escapeHtml(it.label)}
    </span>`
    )
    .join("");
  return `<div style="display:flex;flex-wrap:wrap">${chips}</div>`;
}

// Confirmed live 2026-08-16, with a real user's own screenshot (not
// just a DOM inspection) matching what my own screenshot tool captured
// too: the old two-element approach (a fixed-color ".erp-agent-chart-
// track" with a narrower ".erp-agent-chart-bar" child, width set inline
// as a percentage) painted as an EMPTY gray track — no colored fill
// visible — even though every single computed style on the fill child
// (background-color, width, height, opacity, visibility, z-index,
// position, transform, filter, mix-blend-mode, box-shadow) checked out
// exactly correct in the live DOM. Whatever the actual cause (a real
// paint/compositing edge case with this specific two-box nesting isn't
// worth chasing further once behavior stops matching computed style at
// all — that's no longer a CSS specificity problem to reason about).
// Rebuilt as ONE self-contained element per row: a hard-stop
// `linear-gradient` paints both the "filled" and "empty" portions of
// the track directly as ITS OWN background, with no separate child box
// for a value's color to fail to show up on. Every style is inline
// (no dependency on the shared .erp-agent-chart-* classes at all), so
// this can't regress from an unrelated CSS change elsewhere either.
function renderBarChart(spec: ChartSpec): string {
  const series = spec.series || [];
  const max = Math.max(...series.flatMap((s) => s.values), 0) || 1;
  const legend = renderLegend(series.map((s) => ({ label: s.name, color: s.color })));
  const rows = spec.labels
    .map((label, i) =>
      series
        .map((s) => {
          const value = s.values[i];
          const pct = value > 0 ? Math.max((value / max) * 100, 4) : 0;
          const rowLabel = series.length > 1 ? `${label} — ${s.name}` : label;
          const track = `background:linear-gradient(to right, ${s.color} 0%, ${s.color} ${pct}%, ${CHROME_BG_PAGE} ${pct}%, ${CHROME_BG_PAGE} 100%)`;
          return `
      <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
        <div style="width:140px;flex-shrink:0;font-size:13px;color:${CHROME_INK_SECONDARY};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(rowLabel)}</div>
        <div style="flex:1;min-width:40px;height:16px;border-radius:4px;${track}" title="${escapeHtml(rowLabel)}: ${fmtNumber(value)}"></div>
        <div style="flex-shrink:0;min-width:36px;text-align:right;font-size:13px;font-weight:600;color:${CHROME_INK}">${fmtNumber(value)}</div>
      </div>`;
        })
        .join("")
    )
    .join("");
  return `${renderTitle(spec.title)}${legend}<div class="erp-agent-chart" style="padding:14px" role="img" aria-label="${escapeHtml(spec.title)}">${rows}</div>`;
}

// A fixed 560x180 viewBox scales to any container width (viewBox-based
// SVG is resolution-independent) — matches the fixed-layout approach the
// rest of this app's server-rendered HTML already uses (no client JS to
// measure a real container width at render time).
function renderLineChart(spec: ChartSpec): string {
  const series = spec.series || [];
  const width = 560;
  const height = 180;
  const padX = 36;
  const padY = 20;
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(...allValues, 0);
  // Baseline always includes 0 — a line chart that auto-zooms to its own
  // min/max can visually exaggerate a small real change into what looks
  // like a dramatic swing; same "don't let presentation invent a story
  // the numbers don't support" instinct as the rest of this app's
  // deterministic backstops.
  const min = Math.min(...allValues, 0);
  const range = max - min || 1;
  const n = spec.labels.length;
  const stepX = n > 1 ? (width - padX * 2) / (n - 1) : 0;
  const toXY = (value: number, i: number): [number, number] => {
    const x = padX + stepX * i;
    const y = height - padY - ((value - min) / range) * (height - padY * 2);
    return [x, y];
  };

  const legend = renderLegend(series.map((s) => ({ label: s.name, color: s.color })));
  const polylines = series
    .map((s) => {
      const points = s.values.map((v, i) => toXY(v, i).join(",")).join(" ");
      const dots = s.values
        .map((v, i) => {
          const [x, y] = toXY(v, i);
          // r bumped from 3 -> 5: this viewBox (560x180) is drawn once
          // and then scaled by the browser to whatever width the card
          // actually gets — inside a multi-chart dashboard grid that can
          // be under 300px, well under half scale. A fill-based circle's
          // radius scales down with the viewBox (there's no fill
          // equivalent of vector-effect="non-scaling-stroke" below), so
          // it needs real headroom in source units to still read as a
          // visible dot once shrunk, not just look reasonable at 1:1.
          return `<circle cx="${x}" cy="${y}" r="5" fill="${s.color}"><title>${escapeHtml(s.name)} — ${escapeHtml(spec.labels[i])}: ${fmtNumber(v)}</title></circle>`;
        })
        .join("");
      // Confirmed live 2026-08-16: in a multi-chart dashboard grid this
      // SVG can render at roughly half its 560x180 viewBox size (a
      // ~300px-wide grid cell) — stroke-width is defined in viewBox
      // units, so a plain "2" was scaling down to under 1px on screen,
      // anti-aliased thin enough that the user reported the line's
      // color as "missing"/"faded" even though the actual color value
      // was always correct (verified via getComputedStyle). vector-
      // effect="non-scaling-stroke" keeps the STROKE width in real
      // screen pixels regardless of how much the viewBox itself is
      // scaled down — the fix for exactly this class of bug.
      return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />${dots}`;
    })
    .join("");
  const labelRow = spec.labels
    .map((l, i) => {
      const [x] = toXY(min, i);
      return `<text x="${x}" y="${height - 4}" font-size="10" fill="${CHROME_MUTED_INK}" text-anchor="middle">${escapeHtml(l)}</text>`;
    })
    .join("");

  const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(spec.title)}" style="width:100%;height:auto;display:block">
    <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="${CHROME_BORDER}" stroke-width="1" vector-effect="non-scaling-stroke" />
    ${polylines}
    ${labelRow}
  </svg>`;

  return `${renderTitle(spec.title)}${legend}<div class="erp-agent-chart" style="padding:14px">${svg}</div>`;
}

// Angle 0 = 12 o'clock, positive = clockwise (matches how a pie chart is
// conventionally read) — point on a circle of radius r centered at
// (cx,cy) at that angle.
function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

/**
 * Real SVG wedges rather than a CSS conic-gradient — deliberate, added
 * 2026-08-16 after the first version (conic-gradient) turned out to be
 * the wrong choice for this app's OTHER real use of this exact markup:
 * jsPDF's "Export to PDF" needs to rasterize the on-screen chart via
 * html2canvas to produce a real visual (not just a data table) in the
 * PDF (see ResponseView.tsx), and html2canvas's conic-gradient support
 * is inconsistent across versions/browsers — SVG path rendering is
 * reliably supported. Same visual result on screen either way; only the
 * underlying markup changed.
 */
function renderPieChart(spec: ChartSpec): string {
  const slices = spec.slices || [];
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 70;
  let cursor = 0;

  const wedges = slices
    .map((s) => {
      const startAngle = cursor;
      const endAngle = cursor + (s.percentage / 100) * 360;
      cursor = endAngle;
      // A single slice covering the whole pie has coincident start/end
      // points, which collapses the arc path below to nothing — draw a
      // full circle instead in that one case.
      if (s.percentage >= 100) {
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}"><title>${escapeHtml(s.label)}: ${fmtNumber(s.value)} (${s.percentage}%)</title></circle>`;
      }
      const [x1, y1] = pointOnCircle(cx, cy, r, startAngle);
      const [x2, y2] = pointOnCircle(cx, cy, r, endAngle);
      const largeArc = endAngle - startAngle > 180 ? 1 : 0;
      const path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`;
      return `<path d="${path}" fill="${s.color}"><title>${escapeHtml(s.label)}: ${fmtNumber(s.value)} (${s.percentage}%)</title></path>`;
    })
    .join("");
  // Donut: the same wedges with a plain circle cut out of the middle,
  // matching the chart card's own background so it reads as a hole.
  const hole = spec.chartType === "donut" ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.6}" fill="${CHROME_SURFACE}" />` : "";

  const svg = `<svg viewBox="0 0 ${size} ${size}" width="140" height="140" role="img" aria-label="${escapeHtml(spec.title)}">${wedges}${hole}</svg>`;

  const legend = slices
    .map(
      (s) => `
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:${CHROME_INK};padding:2px 0">
      <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${s.color};flex-shrink:0"></span>
      <span style="flex:1">${escapeHtml(s.label)}</span>
      <span style="color:${CHROME_INK_SECONDARY}">${fmtNumber(s.value)} (${s.percentage}%)</span>
    </div>`
    )
    .join("");

  return `${renderTitle(spec.title)}<div class="erp-agent-chart" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;padding:16px">
    <div style="flex-shrink:0">${svg}</div>
    <div style="flex:1;min-width:180px">${legend}</div>
  </div>`;
}

export function renderSingleChartSpec(spec: ChartSpec): string {
  switch (spec.chartType) {
    case "line":
      return renderLineChart(spec);
    case "pie":
    case "donut":
      return renderPieChart(spec);
    case "bar":
    default:
      return renderBarChart(spec);
  }
}

/**
 * Combines every chart.build result from one turn into a single reply —
 * the "dashboard" capability from the 2026-08-14 session's TODO. One
 * chart renders exactly like before (no grid wrapper, same visual shape
 * as the plain auto-rendered bar chart); more than one lays out as a
 * responsive card grid so a real multi-chart dashboard reads as one
 * coherent reply instead of a list of unrelated fragments.
 */
export function renderChartDashboard(specs: ChartSpec[], intent: DisplayIntent): string {
  if (!specs.length) return `<div class="erp-agent-empty">No chart data.</div>`;
  const body =
    specs.length === 1
      ? renderSingleChartSpec(specs[0])
      : `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">${specs
          .map((spec) => `<div>${renderSingleChartSpec(spec)}</div>`)
          .join("")}</div>`;
  return `<div class="erp-agent-report">${body}${renderNextSteps(intent)}</div>`.trim();
}
