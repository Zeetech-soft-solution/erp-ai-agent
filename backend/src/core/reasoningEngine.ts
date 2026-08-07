import { Session, LLMMessage, LLMProvider, AgentResponse, DisplayIntent } from "./types";
import { callTool, listAllowedTools } from "./gateway";
import { ContextAssembler } from "./contextAssembler";
import { rendererRegistry } from "./rendererRegistry";
import { appConfig } from "../config/app.config";
import { InteractionLogger } from "./types";

const SYSTEM_PROMPT = `You are an ERP operations assistant. You can only use the tools
provided to you — never claim to have done something you didn't call a tool for.
When your final answer includes structured data (a list, a comparison, a summary
of records), end your reply with a single JSON line prefixed EXACTLY with
"DISPLAY_INTENT:" describing how it should be shown, e.g.
DISPLAY_INTENT: {"render":"table","highlight":[],"next_steps":["Mark as won"]}
The same applies when you've proposed something that needs the user's explicit
confirmation before a further action makes it real (e.g. you drafted a reply
and a separate send tool exists, or a status change needs approval) — even
with nothing tabular to show, still end with a DISPLAY_INTENT line using
"render":"none" so the user gets a clickable confirm button instead of having
to retype their answer, e.g.
DISPLAY_INTENT: {"render":"none","next_steps":["Send this email"]}
If nothing needs a next click, omit the DISPLAY_INTENT line entirely.

CRITICAL when using "render":"table" or "cards": a table showing the actual
records is rendered separately, directly below your reply, from the same tool
data — the user sees it too. Your own written reply must NOT re-list, re-name,
or re-describe those same records one by one (no numbered/bulleted list of
them, no repeating each row's fields in prose). Keep your reply to one short
sentence — how many results, and anything the table can't show (e.g. "Found 4
customers starting with Shree.") — and let the table carry the actual data.
This does not apply to "render":"none": with nothing tabular, write normally.

When the user asks for a PDF, invoice copy, printable document, or similar for a
specific record you already have the id for (from a prior list/get call), call
document.get_pdf with that entityKey and id, then end your reply with
DISPLAY_INTENT: {"render":"document"}. A real download button is rendered
separately from the tool result — your own message must be ONE short sentence
only ("Here's the PDF for SAL-QTN-2026-00001.") and must NEVER include a URL,
markdown link, or fabricated domain name of your own — you don't know the real
one, and writing a fake one is worse than writing none.

Whenever you show details of a SINGLE record (a *.get call, or a *.list that
resolved to exactly one row — never a list of many), proactively add a next
step offering its PDF even if the user didn't ask for one, e.g.
"next_steps":["Get PDF of this quotation"] — document.get_pdf itself is only
called once that next step is actually clicked, same as any other next step.
Don't offer this for a multi-row list result — a PDF is for one record, not
a table of them.`;

export class ReasoningEngine {
  constructor(
    private llm: LLMProvider,
    private contextAssembler: ContextAssembler,
    private logger?: InteractionLogger
  ) {}

  async run(session: Session, prompt: string): Promise<AgentResponse> {
    const startedAt = Date.now();
    const tools = listAllowedTools(session);
    const contextChunks = await this.contextAssembler.assemble(session, prompt);

    // Without this, the model has no way to know what "today" actually
    // is and falls back to a guess rooted in its own training data (seen
    // live: a "last week" query filtered on dates from 2023, years off
    // from this deployment's real system date and demo-data timeline) —
    // every relative date ("last week", "this month", "latest") silently
    // resolves against the wrong "now" without this. Computed in IST
    // (Asia/Kolkata), not server-local/UTC — this deployment's company
    // and data are India-based, and a plain UTC date can land on the
    // wrong calendar day for hours around midnight IST (UTC+5:30).
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const messages: LLMMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\nToday's date is ${today}.\nUser roles: ${session.erpnext_roles.join(", ")}` },
      ...(contextChunks.length
        ? [{ role: "system" as const, content: `Relevant context:\n${ContextAssembler.toPromptBlock(contextChunks)}` }]
        : []),
      { role: "user", content: prompt },
    ];

    const toolsUsed: string[] = [];
    const toolCallsLogged: { name: string; args: any }[] = [];
    const modulesUsed = new Set<string>();
    let lastData: any = null;
    let finalText = "";

    for (let i = 0; i < appConfig.llm.maxToolIterations; i++) {
      const response = await this.llm.chat(messages, tools);

      if (response.tool_calls.length === 0) {
        finalText = response.content || "";
        break;
      }

      // One assistant message carries ALL of this turn's tool_calls — it
      // must precede their "tool" result messages, or the provider's API
      // rejects the result messages as orphaned (no matching prior call).
      messages.push({ role: "assistant", content: response.content || "", tool_calls: response.tool_calls });

      for (const call of response.tool_calls) {
        toolsUsed.push(call.name);
        toolCallsLogged.push({ name: call.name, args: call.arguments });
        modulesUsed.add(call.name.split(".")[0]);
        try {
          const result = await callTool(session, call.name, call.arguments);
          lastData = result;
          messages.push({ role: "tool", content: JSON.stringify(result), tool_call_id: call.id, name: call.name });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Tool execution failed";
          messages.push({ role: "tool", content: JSON.stringify({ error: errMsg }), tool_call_id: call.id, name: call.name });
        }
      }
    }

    const { message, displayIntent } = extractDisplayIntent(finalText);
    const response = this.buildResponse(message, lastData, displayIntent, toolsUsed, Array.from(modulesUsed), session);

    const interactionId = await this.logger?.log({
      actor_email: session.sub,
      roles: session.erpnext_roles,
      prompt,
      context_sources_used: contextChunks.map((c) => c.label),
      tool_calls: toolCallsLogged,
      response_type: response.type,
      render_kind: displayIntent?.render,
      latency_ms: Date.now() - startedAt,
      created_at: new Date().toISOString(),
    });
    if (interactionId) response.interaction_id = interactionId;

    return response;
  }

  private buildResponse(
    message: string,
    data: any,
    displayIntent: DisplayIntent | null,
    toolsUsed: string[],
    modulesUsed: string[],
    session: Session
  ): AgentResponse {
    const meta = { modules_used: modulesUsed, tools_used: toolsUsed, role_context: session.erpnext_roles };

    // document.get_pdf's result shape ({ document: {...} }) is
    // structurally different from every other tool's tabular data — no
    // renderer applies, it's a single downloadable link, not rows.
    // Deliberately NOT gated on displayIntent?.render === "document":
    // confirmed live, the LLM reliably calls the tool but inconsistently
    // remembers to also emit the matching DISPLAY_INTENT line, and
    // "does the result have a .document field" is already an
    // unambiguous signal on its own — no other tool ever returns this
    // shape, so there's nothing to disambiguate against.
    if (data?.document) {
      return { type: "document", message, document: data.document, meta };
    }
    if (data && displayIntent) {
      const html = rendererRegistry.render(displayIntent.render, data, displayIntent);
      return { type: "report", message, data, html, meta };
    }
    return { type: "text", message, meta };
  }
}

function extractDisplayIntent(text: string): { message: string; displayIntent: DisplayIntent | null } {
  const marker = "DISPLAY_INTENT:";
  const idx = text.indexOf(marker);
  if (idx === -1) return { message: text, displayIntent: null };
  const message = text.slice(0, idx).trim();
  try {
    const displayIntent = JSON.parse(text.slice(idx + marker.length).trim());
    return { message, displayIntent };
  } catch {
    return { message, displayIntent: null };
  }
}
