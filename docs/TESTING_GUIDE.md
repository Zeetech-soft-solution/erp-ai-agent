# Testing Guide — step by step

Follow in order. Each phase assumes the previous one passed. Where a
curl command is given, run it before trusting the UI — if the API
doesn't return what you expect, the UI won't either, and curl tells
you exactly which layer is broken.

This tier exposes exactly **one** capability end to end: `quotation.list`,
granted to the **Sales User** role only. Every other module you'll see in
the codebase (CRM, Buying, Stock, Accounting, HR, Manufacturing, Projects,
Assets, Quality) is present as an empty, structurally-complete stub — that's
expected, not a bug. This guide only tests what's actually live.

---

## Phase 0 — Prerequisites checklist

- [ ] ERPNext is reachable at some URL you can open in a browser
- [ ] You can log into that ERPNext as an admin
- [ ] Node.js 18+ and npm installed locally
- [ ] Postgres 14+ available (local install, Docker, or managed) with
      permission to run `CREATE EXTENSION vector;`
- [ ] An OpenAI API key (or another OpenAI-compatible endpoint + key)

---

## Phase 1 — ERPNext setup

1. Log into ERPNext as admin.
2. Go to your user profile (top-right) → **API Access** → **Generate Keys**.
   Copy the **API Key** and **API Secret** immediately — the secret is
   shown once only.
3. Create one test user (Users list → New): `sales.user@test.com` — assign
   role **Sales User**. (Optional: a second user with **System Manager**,
   only needed if you also want to try the admin console.)
4. Create at least 2-3 test **Quotation** records manually in ERPNext, for
   different parties — you need real data to see the agent actually
   return something.

**Checkpoint**: note down `ERPNEXT_BASE_URL`, `ERPNEXT_API_KEY`,
`ERPNEXT_API_SECRET`, and the test user's password. You'll need all of
these in the next steps.

---

## Phase 2 — Database

```bash
createdb erp_agent
psql erp_agent -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

If `CREATE EXTENSION vector` fails, your Postgres doesn't have pgvector
installed at the OS level — install it first (`apt install postgresql-16-pgvector`
or equivalent for your distro/version), then retry.

```bash
cd backend
for f in src/db/migrations/*.sql; do psql erp_agent -f "$f"; done
```

Run every file in `src/db/migrations/` in filename order (`001_init.sql`
through the highest-numbered file present) — each one is safe to run only
once, in order.

**Checkpoint**:
```bash
psql erp_agent -c "\dt"
```
should list (at least) `context_embeddings`, `interaction_log`, `settings`,
`admin_audit_log`, `user_credentials`, `rule_evaluations`, `policy_documents`.

---

## Phase 3 — Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
```
ERPNEXT_BASE_URL=<your real URL>
ERPNEXT_API_KEY=<from Phase 1>
ERPNEXT_API_SECRET=<from Phase 1>
DATABASE_URL=postgres://<user>:<pass>@localhost:5432/erp_agent
AGENT_JWT_SECRET=<any long random string>
LLM_API_KEY=<your OpenAI key>
ADMIN_ROLES=System Manager
CREDENTIAL_ENCRYPTION_KEY=<generate with the node command in .env.example>
```

```bash
npm run dev
```

**Checkpoint** — console should print a line confirming the active modules
and `ERP Agent backend running on :4000`. If a module you expect is
missing, check `ACTIVE_MODULES` in `.env`.

### 3a. Health check
```bash
curl http://localhost:4000/health
```
Expect `{"ok":true}`. If this fails, the server isn't running — check the terminal for errors first.

### 3b. Login (this is the real ERPNext connectivity test)
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sales.user@test.com","password":"<their password>"}'
```
Expect a JSON body with `token`, `roles: ["Sales User"]`, and
`allowed_tools: ["quotation.list"]` — exactly one tool, nothing else. **If
this fails**, the problem is `ERPNEXT_BASE_URL`/`API_KEY`/`API_SECRET` or
the user's own password — not the agent code. Save the `token` value, you
need it for every request below.

```bash
export TOKEN="<paste token here>"
```

**Alternative — API key login** (no password sent to the agent at all):
in ERPNext, go to `sales.user@test.com`'s profile → API Access →
Generate Keys, then:
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sales.user@test.com","apiKey":"<key>","apiSecret":"<secret>"}'
```
Should return the same shape as password login.

### 3c. List tools this role can see
```bash
curl http://localhost:4000/api/tools -H "Authorization: Bearer $TOKEN"
```
Sales User should see exactly `quotation.list` — nothing else. If you see
more, or fewer, check `config/roles.policy.ts`.

### 3d. Call the one real ERPNext-backed tool
```bash
curl -X POST http://localhost:4000/api/tools/quotation.list \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
```
Expect your real ERPNext quotations back, with canonical field names
(`id`, `party`, `status`, `total`, `date` — not ERPNext's raw doctype
fields). **This is the actual end-to-end proof** that connector → entity
map → ERPNext REST API all work.

### 3e. Try a tool this tier doesn't expose at all
```bash
curl -X POST http://localhost:4000/api/tools/crm.list_leads \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
```
Expect `403`/"not permitted" (or a "tool not found" style error) — CRM
isn't wired to anything in this tier. If this ever returns real data, flag
it immediately; it means the free/pro boundary has leaked.

### 3f. The reasoning loop (needs a real LLM key)
```bash
curl -X POST http://localhost:4000/api/agent/prompt \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"prompt":"list my quotations"}'
```
Expect `{"type":"report", "message":"...", "data":[...], "html":"<div class=\"erp-agent-report\">...", "meta":{...}}`.

If this errors, check the backend console — most likely cause is a bad
`LLM_API_KEY` or a network/firewall block on `api.openai.com`.

---

## Phase 4 — Admin app

```bash
cd ../frontend/admin
npm install
cp .env.example .env
npm run dev
```
Open `http://localhost:5173`.

- [ ] Log in as your `System Manager` test user
- [ ] Confirm the module-status strip loads
- [ ] Edit a setting (e.g. `context_budget_chars`), save, refresh the page — value should persist
- [ ] Log in as `sales.user@test.com` instead — expect a `403`/redirect, since Sales User isn't in `ADMIN_ROLES`

### 4a. Provision a persistent credential (the impersonation test that matters most)

- [ ] Back in ERPNext, go to `sales.user@test.com`'s own profile → API Access → Generate Keys
- [ ] In the admin app, go to **User credentials**, enter that email + the key/secret you just generated, save
      — expect success (it validates against ERPNext before storing)
- [ ] Try saving a key that does NOT belong to that email — expect a rejected save with a clear error,
      not a silent wrong-identity attachment
- [ ] Revoke the credential from the admin app — confirm any existing agent-app session for that user
      is logged out (try a request with the old token — expect 401)

---

## Phase 5 — Agent app

```bash
cd ../frontend/agent
npm install
cp .env.example .env
npm run dev
```
Open `http://localhost:5174`.

- [ ] Log in as `sales.user@test.com`
- [ ] Send: "list my quotations" — should render as a table matching curl step 3d
- [ ] Resize the browser past 900px wide — capabilities panel should appear on the right
- [ ] Send: "create a new lead" — should fail gracefully (this tier doesn't expose that capability) rather than crashing

---

## Phase 6 — Known gaps (expected, not bugs)

- Every module besides Selling's `quotation.list` — CRM, Buying, Stock, Accounting, HR,
  Manufacturing, Projects, Assets, Quality — is present as an empty configuration stub.
  That's the free/pro boundary, not something to "fix" here.
- No workflows are wired (`config/workflows.config.ts` is intentionally empty).
- `context.search` / prompts that would use semantic search return empty — no embedder wired yet.
- `tickets.list`, `email.list`, `email.draft` return placeholder text — external MCPs not connected.
- No automated test suite exists yet — everything above is manual verification.

---

## If something breaks

Report back with: which phase/step, the exact command or action, and
the exact error message or response body.
