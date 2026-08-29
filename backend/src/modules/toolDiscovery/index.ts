import { MCPModule, ToolDefinition } from "../../core/types";
import { listAllowedTools } from "../../core/gateway";
import { MODULE_PROMPT_SECTIONS } from "../../systemPrompt";
import { MODULE_KEYWORDS } from "../../core/toolRelevanceFilter";

/**
 * The "small tool catalog + on-demand discovery" pattern discussed at
 * length before this was built: rather than loading every rule for
 * every module into the prompt on every single turn (CORE_SYSTEM_PROMPT
 * + MODULE_PROMPT_SECTIONS already do the static/domain split — see
 * docs/SCALING_PLAN.md §10), the model can instead call ONE always-
 * available meta-tool to look up the real tool name for an entity it
 * doesn't already have, AND the specific guidance for using it — on
 * demand, only when actually needed, rather than pre-loaded regardless
 * of relevance. Genuinely additive: CORE's automatic module-section
 * injection is UNCHANGED (still a guaranteed safety net for whatever
 * detectModules() already matched from the raw prompt text) — this
 * exists for what that pass misses: a broad "*" role whose real tool
 * list exceeds OPENAI_MAX_TOOLS and got capped, or a genuinely
 * cross-module question where the model realizes mid-turn it needs an
 * entity nobody flagged upfront.
 *
 * Deliberately reuses REAL existing data, nothing new authored twice:
 * tool identity/description comes straight from moduleRegistry (the
 * same source relayToolDefinitions()/listAllowedTools() already use),
 * and module-level guidance comes straight from MODULE_PROMPT_SECTIONS
 * (the same constants CORE's own automatic injection uses) — never a
 * second, driftable copy of either.
 */

export interface ToolSearchMatch {
  name: string;
  description: string;
}

export interface ToolSearchResult {
  // Grouped by module (module.doctype-style identity — "hr": [...],
  // "selling": [...]) rather than one flat array, so the model sees the
  // real module/doctype branching directly instead of having to infer
  // it by re-splitting each tool's own dotted name itself. Always the
  // COMPLETE real match set — deliberately uncapped. A silently
  // truncated list is worse than a long one: the model would have no
  // way to tell "this is everything" from "this is an arbitrary slice",
  // and could easily miss the one entity it actually needed just
  // because of where it happened to fall in registration order.
  results: Record<string, ToolSearchMatch[]>;
  // MODULE-level guidance (STANDARD DOCUMENT FLOWS, WHO IS ON LEAVE, ...)
  // — broad, applies across every doctype in the module.
  guardrails?: string;
  // 2026-08-23, explicit user request: no longer surfaces doctype-level
  // business-rule descriptions proactively (removed business_rules field
  // that used to live here) — real enforcement (businessRuleEngine.ts,
  // gateway.ts's callTool()) is untouched, a violation still surfaces via
  // the tool result itself when it actually happens.
  write_reminder?: string;
  note?: string;
}

const WRITE_REMINDER =
  "This is a write action (create/update). Confirm with the user first — summarize what you're " +
  "about to do in plain text, then end your reply with a DISPLAY_INTENT line using " +
  '"render":"none" and a next_steps entry describing the action, so the user gets a clickable ' +
  "confirm button. Only actually call this tool on the NEXT turn, after they confirm.";

function getCanonicalModuleForTool(t: ToolDefinition): string {
  if (t.name.startsWith("analytics.") || t.name.startsWith("chart.")) return "analytics";
  if (t.name.startsWith("tickets.") || t.module === "tickets") return "support";
  if (t.name.startsWith("project_issue.") || t.module === "project_issue") return "projects";
  if (t.name.startsWith("payment_entry.") || t.module === "payment_entry_actions") return "accounting";
  if (t.name.startsWith("lead_qualification.") || t.module === "lead_qualification") return "crm";
  return t.module;
}

/**
 * Shared by both the local engine's real gateway.ts dispatch (this
 * module's own `handler`, invoked normally through callTool like any
 * other tool) and the relay's own special-cased in-process branch
 * (relayReasoningEngine.ts calls this directly — same reason
 * analytics.aggregate/communication.reply are special-cased there:
 * this needs the CALLER'S real allowed-tool set, which the relay
 * computes differently — RELAY_READ_TOOLS/RELAY_WRITE_TOOLS +
 * isRelayAllowed — than the local engine's session.allowed_tools).
 * Never authored twice — one real search implementation, two real
 * (already-role-filtered) input lists.
 */
export function searchTools(candidates: ToolDefinition[], args: { query?: string; module?: string }): ToolSearchResult {
  const query = (args.query || "").trim().toLowerCase();
  const wantedModule = (args.module || "").trim().toLowerCase();

  let matched = candidates.filter((t) => t.name !== "tools.search");
  if (wantedModule) {
    matched = matched.filter((t) => {
      const canonical = getCanonicalModuleForTool(t);
      return canonical.toLowerCase() === wantedModule || t.module.toLowerCase() === wantedModule;
    });
  }
  if (query) {
    matched = matched.filter((t) => `${t.name} ${t.description}`.toLowerCase().includes(query));
  }

  const results: Record<string, ToolSearchMatch[]> = {};
  for (const t of matched) {
    const modKey = getCanonicalModuleForTool(t);
    (results[modKey] ||= []).push({
      name: t.name,
      description: t.description.split(/(?<=[.!?])\s/)[0].slice(0, 300),
    });
  }

  // Same real guidance CORE's own automatic domain-section injection
  // uses (buildSystemPrompt()/MODULE_PROMPT_SECTIONS) — reused, not
  // rewritten, so the two can never drift into two different answers
  // for the same module.
  const guardrailBlocks = Object.keys(results)
    .flatMap((m) => MODULE_PROMPT_SECTIONS[m] || [])
    .filter((block, i, arr) => arr.indexOf(block) === i); // dedupe shared blocks, same identity-dedupe as buildSystemPrompt()
  const guardrails = guardrailBlocks.length ? guardrailBlocks.join("\n\n") : undefined;

  const hasWriteAction = matched.some((t) => t.name.endsWith(".create") || t.name.endsWith(".update"));

  const out: ToolSearchResult = { results };
  if (guardrails) out.guardrails = guardrails;
  if (hasWriteAction) out.write_reminder = WRITE_REMINDER;
  if (!matched.length) out.note = "No matching tool in your current access. Double-check the module/keyword, or this entity may genuinely be outside your role's access.";
  return out;
}

export const toolDiscoveryModule: MCPModule = {
  name: "toolDiscovery",
  description: "Search available tools by keyword/module.",
  tools: [
    {
      // 2026-08-23, explicit user request: description cut to a
      // one-liner. Real trade-off, not just moved: the old "module"
      // param description explained what's actually inside "utilities"
      // (calculator, chart, inbox, execute_query, report.generate — the
      // cross-cutting, non-domain tools) — that mapping isn't restated
      // anywhere else; the model can still find these via keyword query,
      // just not by module name alone anymore.
      name: "tools.search",
      module: "meta",
      description: `Search your tools. query (keyword) or module (${Object.keys(MODULE_KEYWORDS).join("|")}). Returns matching tools + module rules. Call FIRST if unsure.`,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          // Same real source of truth as CORE_SYSTEM_PROMPT's own module
          // list — MODULE_KEYWORDS's own keys, never a second hand-typed
          // copy that could drift.
          module: { type: "string", enum: Object.keys(MODULE_KEYWORDS) },
        },
      },
      handler: async (args, session) => searchTools(listAllowedTools(session), args),
    },
  ],
};
