# Knowledge base (RAG source documents)

Every `*.md` file in this folder (except this README) is loaded into the
agent's vector store by:

```bash
npm run knowledge:index            # new or changed files only
npm run knowledge:index -- --force # re-embed everything
```

or by an administrator through `POST /api/admin/knowledge/reindex`.

## What belongs here

Reference documents that explain how a process works: the purpose of each
document type, the order documents follow, what submitting, cancelling or
amending does, where approvals sit. The agent searches them with the
`knowledge.search` tool and also receives the closest passages
automatically as background context.

## What does not belong here

Business rules. The ERP system enforces rules (validations, permissions,
approval workflows). These documents only explain standard behaviour so
the agent understands the data it reads and the results it receives.

## File format

```markdown
---
title: Order to Cash
module: selling
doctypes: Quotation, Sales Order, Delivery Note, Sales Invoice, Payment Entry
---

# Order to Cash

Introductory paragraph (indexed as the "Overview" section).

## Section name

Each "## " section is one retrieval unit. Keep a section about one idea.
```

`module` is a canonical module key (`crm`, `selling`, `buying`, `stock`,
`accounting`, `hr`, `manufacturing`, `projects`, `assets`, `quality`,
`support`, or `general`). Add your own documents (SOPs, internal
manuals) in a separate subfolder, for example `knowledge/company/`.
