import { ContextProvider, ContextChunk, Session } from "../../core/types";
import { appConfig } from "../../config/app.config";
import { Pool } from "pg";

/**
 * WARM tier. Semantic search over pgvector. Requires the "context_embeddings"
 * table (see db/migrations/001_init.sql) and an embedding function
 * (embedText) to turn the prompt into a vector for the similarity query.
 *
 * This is deliberately generic: it doesn't care whether a row came from
 * a past conversation, an ERPNext comment, a ticket, or a KB article —
 * anything that gets embedded and inserted becomes searchable here.
 */
export interface Embedder {
  embed(text: string): Promise<number[]>;
}

class VectorContextProvider implements ContextProvider {
  name = "vector";
  private pool: Pool | null = null;

  constructor(private embedder: Embedder | null = null) {
    if (appConfig.db.postgresUrl) {
      this.pool = new Pool({ connectionString: appConfig.db.postgresUrl });
    }
  }

  setEmbedder(embedder: Embedder) {
    this.embedder = embedder;
  }

  async fetch(session: Session, prompt: string, budgetChars: number): Promise<ContextChunk[]> {
    if (!this.pool || !this.embedder) return []; // not wired yet — safe no-op

    const vector = await this.embedder.embed(prompt);
    const { rows } = await this.pool.query(
      `select label, content, 1 - (embedding <=> $1) as score
       from context_embeddings
       where owner_scope in ('global', $2)
       order by embedding <=> $1
       limit $3`,
      [JSON.stringify(vector), session.sub, appConfig.context.vectorTopK]
    );

    let used = 0;
    return rows
      .map((r): ContextChunk => ({ source: "vector", label: r.label, content: r.content, score: r.score }))
      .filter((c) => (used += c.content.length) <= budgetChars);
  }
}

export const vectorContextProvider = new VectorContextProvider();
