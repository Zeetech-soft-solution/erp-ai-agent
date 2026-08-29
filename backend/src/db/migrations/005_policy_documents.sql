-- Admin-managed policy/reference documents (business policy, workflow
-- rules) fed into the WARM vector context tier (context_embeddings) as
-- a RAG source. A first-class row per document — not just loose
-- embedded chunks — so admin can list/edit/deactivate/reload one
-- without hunting through embedding rows.
create table if not exists policy_documents (
  id            bigserial primary key,
  title         text not null,
  module        text,                 -- canonical module key, null = applies everywhere
  filename      text not null,
  raw_text      text not null,        -- extracted (or admin-edited) plain text; re-embedded on every save
  uploaded_by   text not null,
  version       integer not null default 1,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Links each embedded chunk back to its source document so a re-index
-- (edit or reload) can cleanly delete-and-reinsert that document's
-- chunks without touching any other row in context_embeddings.
alter table context_embeddings add column if not exists policy_document_id bigint references policy_documents(id) on delete cascade;
create index if not exists context_embeddings_policy_doc_idx on context_embeddings (policy_document_id);
