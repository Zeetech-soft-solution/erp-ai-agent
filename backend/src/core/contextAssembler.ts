import { ContextProvider, ContextChunk, Session } from "./types";
import { appConfig } from "../config/app.config";

/**
 * Runs the HOT and WARM providers automatically on every prompt, within
 * a shared character budget, and returns a compact bundle for the LLM.
 * COLD tier (controller lookups) is intentionally NOT run here — it's
 * exposed as a normal callable tool (context.lookup) so the LLM decides
 * when it actually needs a deeper, specific fetch instead of it being
 * pushed into every request whether needed or not.
 */
export class ContextAssembler {
  constructor(private providers: ContextProvider[]) {}

  async assemble(session: Session, prompt: string): Promise<ContextChunk[]> {
    const budgetPerProvider = Math.floor(appConfig.context.totalBudgetChars / Math.max(this.providers.length, 1));
    const results = await Promise.all(
      this.providers.map((p) => p.fetch(session, prompt, budgetPerProvider).catch(() => [] as ContextChunk[]))
    );
    return results.flat();
  }

  static toPromptBlock(chunks: ContextChunk[]): string {
    if (!chunks.length) return "";
    return chunks.map((c) => `[${c.source}:${c.label}] ${c.content}`).join("\n");
  }
}
