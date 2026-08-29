import { LLMProvider, LLMMessage, LLMResponse, ToolDefinition } from "../../core/types";
import { appConfig } from "../../config/app.config";
import { settingsService } from "../../core/settingsService";
import axios from "axios";
import http from "http";
import https from "https";

// Connection reuse for every call this process makes to OpenAI (or
// whatever OpenAI-compatible baseUrl is configured) — a multi-tool-call
// turn makes 2+ of these sequentially. A keep-alive Agent lets Node reuse
// an already-negotiated connection for the next call to the same host.
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });
const llmHttp = axios.create({ httpAgent, httpsAgent });

/**
 * OpenAI-compatible chat-completions implementation of LLMProvider.
 * This is the ONLY file that knows about OpenAI's request/response
 * shape. Replacing it with your own hosted model later means writing
 * one new class implementing the same LLMProvider interface and
 * flipping LLM_PROVIDER in app.config — reasoningEngine.ts never changes.
 *
 * baseUrl/model/apiKey are read from the DB-backed settings on every
 * call (llm_base_url/llm_model/llm_api_key), falling back to the .env
 * value if that row doesn't exist yet. settingsService's own short cache
 * means this doesn't add a real DB round-trip per prompt.
 */
export class OpenAIProvider implements LLMProvider {
  async chat(messages: LLMMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    const toolSchemas = tools.map((t) => ({
      type: "function",
      function: {
        name: toOpenAIName(t.name),
        description: t.description,
        parameters: t.parameters || { type: "object", properties: {} },
      },
    }));

    const baseUrl = await settingsService.get("llm_base_url", appConfig.llm.baseUrl);
    const model = await settingsService.get("llm_model", appConfig.llm.model);
    const apiKey = await settingsService.get("llm_api_key", appConfig.llm.apiKey);

    const payload = {
      model,
      messages: messages.map((m) =>
        m.role === "assistant" && m.tool_calls?.length
          ? {
              role: "assistant",
              content: m.content || null,
              tool_calls: m.tool_calls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: { name: toOpenAIName(tc.name), arguments: JSON.stringify(tc.arguments) },
              })),
            }
          : {
              role: m.role,
              content: m.content,
              ...(m.tool_call_id ? { tool_call_id: m.tool_call_id, name: toOpenAIName(m.name!) } : {}),
            }
      ),
      tools: toolSchemas,
      // Force one tool call per response so the model's decision process
      // is genuinely serial (call one, see the real result, decide the
      // next) instead of batching speculative calls.
      parallel_tool_calls: toolSchemas.length ? false : undefined,
    };

    // A burst of concurrent requests can hit the org's shared OpenAI TPM
    // budget and get a 429; OpenAI's own error message names how long to
    // wait ("Please try again in 2.641s"). Retry that long, with jitter,
    // up to MAX_ATTEMPTS. A stuck/slow completion is capped at
    // REQUEST_TIMEOUT_MS and retried the same way.
    const MAX_ATTEMPTS = 6;
    const REQUEST_TIMEOUT_MS = 25_000;
    let lastErr: any;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const res = await llmHttp.post(`${baseUrl}/chat/completions`, payload, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: REQUEST_TIMEOUT_MS,
        });
        const choice = res.data.choices[0].message;
        const toolCalls = (choice.tool_calls || []).map((tc: any) => ({
          id: tc.id,
          name: fromOpenAIName(tc.function.name),
          arguments: safeParse(tc.function.arguments),
        }));
        const rawUsage = res.data.usage;
        const usage = rawUsage
          ? { promptTokens: rawUsage.prompt_tokens ?? 0, completionTokens: rawUsage.completion_tokens ?? 0, totalTokens: rawUsage.total_tokens ?? 0 }
          : undefined;
        return { content: choice.content ?? null, tool_calls: toolCalls, usage };
      } catch (err: any) {
        lastErr = err;
        const status = err.response?.status;
        const isTimeout = err.code === "ECONNABORTED" || /timeout/i.test(err.message || "");
        const message = err.response?.data?.error?.message || err.message;
        if (status === 429 && attempt < MAX_ATTEMPTS - 1) {
          const waitMs = Math.min(parseRetryAfterMs(message) ?? 1500, 10000) + Math.floor(Math.random() * 300);
          console.warn(`[openaiProvider] 429 rate limited (attempt ${attempt + 1}), retrying in ${waitMs}ms`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        if (attempt < MAX_ATTEMPTS - 1 && isTimeout) {
          const waitMs = 300 + Math.floor(Math.random() * 300);
          console.warn(`[openaiProvider] request timed out after ${REQUEST_TIMEOUT_MS}ms (attempt ${attempt + 1}), retrying in ${waitMs}ms`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        const wrapped = new Error(isTimeout ? `LLM request timed out after ${REQUEST_TIMEOUT_MS}ms` : `LLM request failed: ${message}`);
        (wrapped as any).status = status;
        throw wrapped;
      }
    }
    throw lastErr;
  }
}

/** Pulls the wait time out of OpenAI's own "Please try again in 2.641s"
 *  (seconds) or "...in 500ms" phrasing — returns milliseconds, or null
 *  if the message doesn't have one (a different 429 shape/provider). */
export function parseRetryAfterMs(message: string): number | null {
  const ms = message.match(/try again in ([\d.]+)ms/i);
  if (ms) return Math.ceil(parseFloat(ms[1]));
  const sec = message.match(/try again in ([\d.]+)s/i);
  if (sec) return Math.ceil(parseFloat(sec[1]) * 1000);
  return null;
}

/**
 * Our tool names are dot-namespaced (e.g. "crm.list_leads",
 * "stock.report.stock_balance") for readability across the codebase,
 * but OpenAI's function-calling API rejects any name not matching
 * ^[a-zA-Z0-9_-]+$ — no dots. "__" is a safe, reversible stand-in.
 */
function toOpenAIName(name: string) {
  return name.replace(/\./g, "__");
}

function fromOpenAIName(name: string) {
  return name.replace(/__/g, ".");
}

function safeParse(json: string) {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
