import { RendererFn, DisplayIntent } from "./types";
import { escapeHtml } from "../renderers/escape";

/**
 * Registry of "render kind" -> HTML builder. The LLM only ever chooses
 * a kind by NAME (table/chart/cards/...); it never emits HTML itself.
 * Add a new visual style by writing one renderer file and calling
 * register() — no changes anywhere else.
 */
class RendererRegistry {
  private renderers = new Map<string, RendererFn>();

  register(kind: string, fn: RendererFn) {
    this.renderers.set(kind, fn);
  }

  render(kind: string, data: any, intent: DisplayIntent): string {
    const fn = this.renderers.get(kind) || this.renderers.get("raw")!;
    try {
      return fn(data, intent);
    } catch {
      return this.renderers.get("raw")!(data, intent);
    }
  }
}

export const rendererRegistry = new RendererRegistry();

// Shared by every renderer (table, raw, ...) so a confirm-style action
// (see next_steps in SYSTEM_PROMPT — used for both "here's a list, want to
// act on a row" and "here's a draft, want to actually send it") always
// gets the same clickable button row, regardless of render kind.
export function renderNextSteps(intent: DisplayIntent): string {
  const steps = (intent.next_steps || [])
    .map((s) => `<button class="erp-agent-next-step" data-action="${escapeHtml(s)}">${escapeHtml(s)}</button>`)
    .join("");
  return steps ? `<div class="erp-agent-next-steps">${steps}</div>` : "";
}

// Fallback that always works, even for shapes no specific renderer handles.
rendererRegistry.register(
  "raw",
  (data, intent) => `<pre class="erp-agent-raw">${escapeHtml(JSON.stringify(data, null, 2))}</pre>${renderNextSteps(intent)}`
);

// Confirm-only: no data body, just the next_steps button row - for when
// the message text already says everything (e.g. a drafted email) and the
// only thing left is a confirm click, so there's nothing worth dumping raw.
rendererRegistry.register("none", (_data, intent) => renderNextSteps(intent));
