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
If nothing needs a next click, omit the DISPLAY_INTENT line entirely.`;

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

    const messages: LLMMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\nUser roles: ${session.erpnext_roles.join(", ")}` },
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
