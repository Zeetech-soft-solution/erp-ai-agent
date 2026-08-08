# Running the agent — minimal guide

This tier exposes exactly **one** live capability: `quotation.list`, granted
to the **Sales User** role. Everything else in the codebase is a real,
complete folder shape with empty content (pro-tier fills it in) — see
`docs/ARCHITECTURE.md`. This guide is just enough to get the whole thing
running end to end.

## 1. Prerequisites

- ERPNext reachable at a URL, with an admin login
- Node.js 18+, npm
- Postgres 14+ with `CREATE EXTENSION vector;` permission
- An OpenAI API key (or another OpenAI-compatible endpoint + key)
- One ERPNext user with role **Sales User**, and a couple of test
  Quotation records so there's something to see

## 2. Database

```bash
createdb erp_agent
psql erp_agent -c "CREATE EXTENSION IF NOT EXISTS vector;"
cd backend
for f in src/db/migrations/*.sql; do psql erp_agent -f "$f"; done
```

## 3. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `.env`: `ERPNEXT_BASE_URL`, `ERPNEXT_API_KEY`/`ERPNEXT_API_SECRET`
(from ERPNext → your profile → API Access → Generate Keys), `DATABASE_URL`,
`AGENT_JWT_SECRET`, `LLM_API_KEY`, `CREDENTIAL_ENCRYPTION_KEY` (generate
with the node command in the `.env.example` comment).

```bash
npm run dev
```

Backend is up on `:4000` once it prints `ERP Agent backend running on :4000`.

## 4. Admin console

```bash
cd frontend/admin && npm install && cp .env.example .env && npm run dev
```

Open `http://localhost:5173`, sign in as a `System Manager` (`ADMIN_ROLES`
in `.env`).

## 5. Agent app

```bash
cd frontend/agent && npm install && cp .env.example .env && npm run dev
```

Open `http://localhost:5174`, sign in as the Sales User you created, and
ask it to "list my quotations."

That's a full run: backend + admin console + agent app, against your real
ERPNext data.

## If something breaks

Report back with: which step, the exact command, and the exact error
message or response body.
