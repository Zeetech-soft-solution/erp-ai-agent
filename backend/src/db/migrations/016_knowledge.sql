-- Knowledge base (RAG): reference documents that teach the agent how
-- standard ERPNext flows work (Order to Cash, Procure to Pay, stock,
-- manufacturing, period close, approvals ...). Same shape as
-- policy_documents (005): one row per document, its chunks embedded into
-- context_embeddings. Source files live in backend/knowledge/**/*.md and
-- are loaded with `npm run knowledge:index` (or the admin reindex route).
create table if not exists knowledge_documents (
  id            bigserial primary key,
  slug          text not null unique,   -- path under backend/knowledge, e.g. erpnext/order-to-cash
  title         text not null,
  module        text,                   -- canonical module key (selling, buying, stock ...), null = general
  doctypes      text[] not null default '{}',
  raw_text      text not null,
  checksum      text not null,          -- unchanged file = no re-embedding
  active        boolean not null default true,
  indexed_at    timestamptz not null default now()
);

alter table context_embeddings add column if not exists knowledge_document_id bigint references knowledge_documents(id) on delete cascade;
create index if not exists context_embeddings_knowledge_doc_idx on context_embeddings (knowledge_document_id);
