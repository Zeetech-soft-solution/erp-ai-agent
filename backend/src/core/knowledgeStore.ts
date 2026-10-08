import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { Pool } from "pg";
import { appConfig } from "../config/app.config";
import { Embedder } from "../providers/context/vectorContextProvider";
import { chunkText } from "./policyDocumentStore";

/**
 * Knowledge base (RAG) over reference documents that describe how the
 * ERP's standard flows work. The agent reads ERPNext's live data through
 * its tools; this store gives it the MEANING of that data: which document
 * follows which, what submitting does, where approvals sit. It never holds
 * business rules: ERPNext decides, the documents only explain.
 *
 * Source: markdown files under backend/knowledge/ with a small front
 * matter block (title, module, doctypes). Each "## " section becomes its
 * own retrieval unit, prefixed with "<title> > <section>" so a chunk still
 * says what it is about after it is cut out of the file. Chunks are stored
 * in context_embeddings (owner_scope 'global'), the same vector space as
 * policy documents, so the WARM context tier surfaces them automatically
 * and knowledge.search can also query them on demand.
 */

export interface KnowledgeFile {
  slug: string;
  title: string;
  module: string | null;
  doctypes: string[];
  body: string;
}

export interface KnowledgeChunk {
  label: string;
  content: string;
}

export interface KnowledgeHit {
  title: string;
  module: string | null;
  label: string;
  content: string;
  score: number;
}

export const KNOWLEDGE_ROOT = path.resolve(__dirname, "../../knowledge");

/** Parses one knowledge markdown file. Front matter is optional; the title
 *  falls back to the first "# " heading, then to the slug. */
export function parseKnowledgeMarkdown(slug: string, raw: string): KnowledgeFile {
  let body = raw.replace(/\r\n/g, "\n");
  const meta: Record<string, string> = {};
  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    body = body.slice(fm[0].length);
  }
  const heading = body.match(/^#\s+(.+)$/m);
  return {
    slug,
    title: meta.title || heading?.[1].trim() || slug,
    module: meta.module || null,
    doctypes: (meta.doctypes || "").split(",").map((d) => d.trim()).filter(Boolean),
    body: body.trim(),
  };
}

/** Splits a document into labelled retrieval chunks: one per "## " section,
 *  long sections further split by the shared policy chunker. */
export function chunkKnowledge(doc: KnowledgeFile): KnowledgeChunk[] {
  const sections: { name: string; text: string }[] = [];
  let current = { name: "Overview", text: "" };
  for (const line of doc.body.split("\n")) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      if (current.text.trim()) sections.push(current);
      current = { name: h2[1].trim(), text: "" };
    } else if (!/^#\s+/.test(line)) {
      current.text += line + "\n";
    }
  }
  if (current.text.trim()) sections.push(current);

  const chunks: KnowledgeChunk[] = [];
  for (const s of sections) {
    const parts = chunkText(s.text.trim());
    parts.forEach((part, i) => {
      const label = `knowledge:${doc.slug}#${s.name}${parts.length > 1 ? ` (${i + 1}/${parts.length})` : ""}`;
      chunks.push({ label, content: `${doc.title} > ${s.name}\n\n${part}` });
    });
  }
  return chunks;
}

/** Every *.md file under root (README.md excluded), as slug + raw text. */
export async function readKnowledgeFiles(root = KNOWLEDGE_ROOT): Promise<{ slug: string; raw: string }[]> {
  const out: { slug: string; raw: string }[] = [];
  async function walk(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".md") && entry.name.toLowerCase() !== "readme.md") {
        const slug = path.relative(root, full).replace(/\\/g, "/").replace(/\.md$/, "");
        out.push({ slug, raw: await fs.readFile(full, "utf8") });
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

export class KnowledgeStore {
  private pool: Pool | null = appConfig.db.postgresUrl ? new Pool({ connectionString: appConfig.db.postgresUrl }) : null;

  constructor(private embedder: Embedder | null) {}

  async list(): Promise<{ id: string; slug: string; title: string; module: string | null; doctypes: string[]; active: boolean; indexed_at: string }[]> {
    if (!this.pool) return [];
    const { rows } = await this.pool.query(
      `select id, slug, title, module, doctypes, active, indexed_at from knowledge_documents order by slug`
    );
    return rows;
  }

  /** Loads every file under root. Unchanged files (same checksum) are
   *  skipped unless force; files that disappeared are removed. */
  async indexAll(opts: { root?: string; force?: boolean } = {}): Promise<{ indexed: string[]; unchanged: string[]; removed: string[] }> {
    if (!this.pool) throw new Error("Knowledge store not configured (DATABASE_URL missing)");
    if (!this.embedder) throw new Error("No embeddings provider configured (set EMBEDDINGS_API_KEY or LLM_API_KEY)");

    const files = await readKnowledgeFiles(opts.root);
    const result = { indexed: [] as string[], unchanged: [] as string[], removed: [] as string[] };

    for (const file of files) {
      const checksum = createHash("sha256").update(file.raw).digest("hex");
      const existing = (await this.pool.query(`select id, checksum from knowledge_documents where slug = $1`, [file.slug])).rows[0];
      if (existing && existing.checksum === checksum && !opts.force) {
        result.unchanged.push(file.slug);
        continue;
      }
      const doc = parseKnowledgeMarkdown(file.slug, file.raw);
      const { rows } = await this.pool.query(
        `insert into knowledge_documents (slug, title, module, doctypes, raw_text, checksum, indexed_at)
         values ($1,$2,$3,$4,$5,$6, now())
         on conflict (slug) do update set title = excluded.title, module = excluded.module, doctypes = excluded.doctypes,
           raw_text = excluded.raw_text, checksum = excluded.checksum, indexed_at = now()
         returning id`,
        [doc.slug, doc.title, doc.module, doc.doctypes, doc.body, checksum]
      );
      const id = rows[0].id;
      await this.pool.query(`delete from context_embeddings where knowledge_document_id = $1`, [id]);
      for (const chunk of chunkKnowledge(doc)) {
        const vector = await this.embedder.embed(chunk.content);
        await this.pool.query(
          `insert into context_embeddings (owner_scope, label, content, embedding, knowledge_document_id)
           values ('global', $1, $2, $3, $4)`,
          [chunk.label, chunk.content, JSON.stringify(vector), id]
        );
      }
      result.indexed.push(file.slug);
    }

    const present = files.map((f) => f.slug);
    const gone = await this.pool.query(`delete from knowledge_documents where not (slug = any($1)) returning slug`, [present]);
    result.removed = gone.rows.map((r) => r.slug);
    return result;
  }

  /** Semantic search over active knowledge documents. */
  async search(query: string, opts: { module?: string; topK?: number } = {}): Promise<KnowledgeHit[]> {
    if (!this.pool || !this.embedder) return [];
    const vector = await this.embedder.embed(query);
    const { rows } = await this.pool.query(
      `select d.title, d.module, e.label, e.content, 1 - (e.embedding <=> $1) as score
       from context_embeddings e
       join knowledge_documents d on d.id = e.knowledge_document_id
       where d.active and ($2::text is null or d.module = $2 or d.module is null)
       order by e.embedding <=> $1
       limit $3`,
      [JSON.stringify(vector), opts.module ?? null, Math.min(opts.topK ?? 5, 10)]
    );
    return rows.map((r) => ({ ...r, score: Number(r.score) }));
  }
}
