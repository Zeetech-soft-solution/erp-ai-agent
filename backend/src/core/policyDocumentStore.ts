import { Pool } from "pg";
import { appConfig } from "../config/app.config";
import { Embedder } from "../providers/context/vectorContextProvider";

export interface PolicyDocumentRow {
  id: string;
  title: string;
  module: string | null;
  filename: string;
  raw_text: string;
  uploaded_by: string;
  version: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Generous enough to keep a policy clause intact without blowing the
// per-provider context budget (see config/app.config.ts's
// context.totalBudgetChars, split across every ContextProvider).
const CHUNK_SIZE = 1200;
// Standard RAG sliding-window overlap: without this, a clause that
// happens to fall right on a chunk boundary loses its surrounding
// context on BOTH sides - the chunk before it is missing the setup,
// the chunk after is missing the lead-in. Carrying the tail of chunk
// N into the start of chunk N+1 means a boundary can only ever cost
// you duplication, never lost context. ~12% of CHUNK_SIZE, the
// conventional range (commonly cited 10-20%) for word-based English text.
const CHUNK_OVERLAP = 150;

// PDF text extraction (pdf-parse) very often has NO blank-line paragraph
// breaks at all - unlike mammoth's .docx output, a PDF's raw text can be
// one continuous run per page. Without this hard-wrap, that entire page
// would land in a single oversized "paragraph" and become one giant
// chunk, defeating CHUNK_SIZE's whole purpose. Wraps on a word boundary
// where possible so a mid-word split is only ever a last resort.
function hardWrap(paragraph: string): string[] {
  if (paragraph.length <= CHUNK_SIZE) return [paragraph];
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > CHUNK_SIZE) {
    let cut = rest.lastIndexOf(" ", CHUNK_SIZE);
    if (cut < CHUNK_SIZE * 0.5) cut = CHUNK_SIZE; // no reasonable space found - hard cut
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).flatMap(hardWrap);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + p.length + 2 > CHUNK_SIZE) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);

  if (chunks.length <= 1) return chunks;
  return chunks.map((c, i) => {
    if (i === 0) return c;
    const prevTail = chunks[i - 1].slice(-CHUNK_OVERLAP);
    // Landing mid-word on the overlap boundary is harmless for an
    // embedding (it's not shown to a human raw) - not worth the extra
    // complexity of word-aligning it too.
    return `${prevTail}\n\n${c}`;
  });
}

/**
 * Admin-managed policy/reference documents (business policy, workflow
 * rules) — the first-class row lives in `policy_documents`; its content
 * is chunked and embedded into `context_embeddings` (owner_scope
 * 'global') so vectorContextProvider surfaces it like any other WARM
 * context during a normal prompt. Every create/update/reactivate fully
 * re-indexes: old chunks for that document are deleted and replaced,
 * so an edit or reload never leaves stale embeddings behind.
 */
export class PolicyDocumentStore {
  private pool: Pool | null = appConfig.db.postgresUrl ? new Pool({ connectionString: appConfig.db.postgresUrl }) : null;

  constructor(private embedder: Embedder | null) {}

  async list(): Promise<PolicyDocumentRow[]> {
    if (!this.pool) return [];
    const { rows } = await this.pool.query(
      `select id, title, module, filename, raw_text, uploaded_by, version, active, created_at, updated_at
       from policy_documents order by title`
    );
    return rows;
  }

  async create(params: { title: string; module: string | null; filename: string; text: string; uploadedBy: string }): Promise<PolicyDocumentRow> {
    if (!this.pool) throw new Error("Policy document store not configured (DATABASE_URL missing)");
    const { rows } = await this.pool.query(
      `insert into policy_documents (title, module, filename, raw_text, uploaded_by)
       values ($1,$2,$3,$4,$5) returning *`,
      [params.title, params.module, params.filename, params.text, params.uploadedBy]
    );
    const doc: PolicyDocumentRow = rows[0];
    await this.reindex(doc);
    return doc;
  }

  /** Returns null if no document with this id exists. */
  async update(id: string, patch: { title?: string; module?: string | null; text?: string }): Promise<PolicyDocumentRow | null> {
    if (!this.pool) throw new Error("Policy document store not configured (DATABASE_URL missing)");
    const existing = (await this.pool.query(`select * from policy_documents where id = $1`, [id])).rows[0];
    if (!existing) return null;

    const { rows } = await this.pool.query(
      `update policy_documents set title = $1, module = $2, raw_text = $3, version = version + 1, updated_at = now()
       where id = $4 returning *`,
      [
        patch.title ?? existing.title,
        patch.module !== undefined ? patch.module : existing.module,
        patch.text ?? existing.raw_text,
        id,
      ]
    );
    const doc: PolicyDocumentRow = rows[0];
    if (doc.active) await this.reindex(doc);
    return doc;
  }

  /** Returns false if no document with this id exists. */
  async setActive(id: string, active: boolean): Promise<boolean> {
    if (!this.pool) throw new Error("Policy document store not configured (DATABASE_URL missing)");
    const { rows } = await this.pool.query(
      `update policy_documents set active = $1, updated_at = now() where id = $2 returning *`,
      [active, id]
    );
    const doc: PolicyDocumentRow | undefined = rows[0];
    if (!doc) return false;
    if (active) await this.reindex(doc);
    else await this.pool.query(`delete from context_embeddings where policy_document_id = $1`, [id]);
    return true;
  }

  /** Returns false if no document with this id existed to delete. */
  async remove(id: string): Promise<boolean> {
    if (!this.pool) throw new Error("Policy document store not configured (DATABASE_URL missing)");
    // context_embeddings rows cascade via the policy_document_id FK.
    const { rowCount } = await this.pool.query(`delete from policy_documents where id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }

  private async reindex(doc: PolicyDocumentRow): Promise<void> {
    if (!this.pool) return;
    if (!this.embedder) {
      throw new Error("No embeddings provider configured (set EMBEDDINGS_API_KEY or LLM_API_KEY) — cannot index policy documents");
    }
    await this.pool.query(`delete from context_embeddings where policy_document_id = $1`, [doc.id]);

    const chunks = chunkText(doc.raw_text);
    const labelPrefix = doc.module ? `policy:${doc.module}:${doc.title}` : `policy:${doc.title}`;
    for (let i = 0; i < chunks.length; i++) {
      const label = chunks.length > 1 ? `${labelPrefix} (part ${i + 1}/${chunks.length})` : labelPrefix;
      const vector = await this.embedder.embed(chunks[i]);
      await this.pool.query(
        `insert into context_embeddings (owner_scope, label, content, embedding, policy_document_id)
         values ('global', $1, $2, $3, $4)`,
        [label, chunks[i], JSON.stringify(vector), doc.id]
      );
    }
  }
}
