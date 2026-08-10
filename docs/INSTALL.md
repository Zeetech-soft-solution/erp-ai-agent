# Installing Noviz Pro

A complete, step-by-step install for everything in this repo: the backend API, its
database, the admin console, the agent (chat) app, and — as an **optional** step — wiring
it up to a real ERP system via the ERPNext connector.

For the condensed version aimed at developers who just want it running, see
`docs/TESTING_GUIDE.md`. This guide is the fuller walkthrough, with the reasoning behind
each step and what to do when something doesn't come up cleanly.

## What you're installing

| Piece | What it is | Runs on |
|---|---|---|
| Backend | Node/TypeScript API — core engine, config, connectors, routes | `:4000` |
| Backend database | Postgres + `pgvector` — context memory, interaction logs, settings | your Postgres instance |
| Admin console | React/Vite app — settings, user credentials, policy documents | `:5173` |
| Agent app | React/Vite app — the end-user chat/agent UI | `:5174` |
| ERP connector | Optional. ERPNext ships as the reference connector; other systems (SAP, etc.) are a Pro-tier custom-connector engagement | your ERP instance, if any |

The agent runs and is fully testable **without** a real ERP connected — see
[Step 3](#step-3-connect-an-erp-system-optional) for why that step is optional and what a
demo install looks like without it.

## Prerequisites

- Node.js 18+ and npm
- Postgres 14+, with permission to run `CREATE EXTENSION vector;`
- An OpenAI API key, or any OpenAI-compatible endpoint + key (`LLM_BASE_URL` in `.env`)
- *(Optional, only if you're connecting a real ERP)* An ERPNext instance reachable over
  HTTP(S), with an admin login

## Step 1 — Install the backend

```bash
cd backend
npm install
cp .env.example .env
```

You'll fill in the actual values in the next two steps (database, then optionally ERPNext)
— for now this just gets the file in place. Two values you can set immediately regardless
of the rest:

```bash
# .env
AGENT_JWT_SECRET=change_this_to_a_long_random_string
LLM_API_KEY=sk-...            # your OpenAI (or OpenAI-compatible) key
CREDENTIAL_ENCRYPTION_KEY=... # generate with the command below
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run that command twice — once for `AGENT_JWT_SECRET` if you want a generated value instead
of typing your own, and once for `CREDENTIAL_ENCRYPTION_KEY`, which encrypts
admin-provisioned ERP credentials at rest and has to be a real random value, not a
placeholder.

## Step 2 — Install the backend database

Everything agent-side — session context, semantic search, interaction logs, admin
settings — lives in one self-hosted Postgres database with the `vector` extension. It
never touches your ERP's own database.

```bash
createdb erp_agent
psql erp_agent -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Then run every migration in `backend/src/db/migrations/`, **in filename order** — they're
numbered for exactly this reason:

```bash
cd backend
for f in src/db/migrations/*.sql; do psql erp_agent -f "$f"; done
```

That creates (among others): `context_embeddings` (pgvector semantic search),
`interaction_log` / `rule_evaluations` (every reasoning-engine run, also the training-data
source — see `docs/TRAINING_PLAN.md`), `settings` / `admin_audit_log`, and
`user_credentials` (AES-256-GCM encrypted at rest, used only if you provision ERP API keys
via the admin console instead of live password logins).

Point the backend at it:

```bash
# .env
DATABASE_URL=postgres://user:password@localhost:5432/erp_agent
```

The database starts empty — it fills in as the agent is used (interaction logs, cached
context, etc.). It does **not** need seed/sample data to run; that's a separate concern
from the ERPNext side, covered next.

## Step 3 — Connect an ERP system (optional)

The agent's core is ERP-agnostic by design (see `docs/ARCHITECTURE.md`) — it talks to
whatever implements the `SystemConnector` interface. **ERPNext ships as the reference
connector in this repo** and is the only one implemented out of the box today.

You can skip this step entirely and still run the full install through
[Step 6](#step-6-test-with-a-demo-install) — the backend, database, admin console, and
agent app all come up fine with no ERP connected; you just won't be able to log in as an
ERPNext user or call ERPNext-backed tools (`quotation.list`, etc.) until this step is done.

### 3a. Using your own ERPNext instance

In ERPNext: your user profile → **API Access → Generate Keys**. That gives you an API key
and secret. Put them in the backend's `.env`:

```bash
# .env
ERPNEXT_BASE_URL=https://your-erpnext-site.example.com
ERPNEXT_API_KEY=...
ERPNEXT_API_SECRET=...
SYSTEM_PROVIDER=erpnext
```

`ERPNEXT_API_KEY`/`SECRET` here are **service-level** credentials, held only by the agent
backend, used for privileged calls like `getUserRoles`. Individual end users still log in
with their own ERPNext identity (password or their own personal API key) — see "Per-user
impersonation" in `docs/ARCHITECTURE.md` for why the two are kept separate.

### 3b. ERPNext reference/demo database (optional)

If you don't already have an ERPNext instance with data in it to test against, you need
*something* populated to point this at — an empty ERPNext site with no Quotations, no
Leads, no test users has nothing for the agent to list or act on. Two ways to get there:

- Spin up a fresh ERPNext instance yourself (the official
  [`frappe_docker`](https://github.com/frappe/frappe_docker) quick-start, or a Frappe Cloud
  trial site) and enter a handful of test records by hand — a **Sales User** and a couple
  of **Quotation** records is enough to exercise the one live capability in this tier (see
  [Step 6](#step-6-test-with-a-demo-install)).
- Import ERPNext's own demo/sample data, if your ERPNext version ships one, as a faster
  starting point than entering records by hand.

> **Need a larger or more realistic dataset — multiple roles, modules, and volumes of
> records for proper multi-scenario testing — rather than a handful of hand-entered rows?**
> We can put together a synthetic ERPNext database (and, if you need it, the source code
> that generated it) sized to your testing needs. Contact us at **support@noviz.in** for
> pricing.

### Connecting a different ERP later

Swapping in a different business system (SAP, or anything else) means writing one new
`SystemConnector` implementation — `sap/README.md` in this repo has the checklist. Nothing
in `core/`, `modules/`, or either frontend needs to change; that's a Pro-tier custom
connector engagement, not something this repo ships pre-built. Reach out to
**support@noviz.in** if that's what you need.

## Step 4 — Install the admin console

```bash
cd frontend/admin
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. Sign in with a user whose role is in `ADMIN_ROLES` (`.env`
default: `System Manager`) — this is a separate permission check from ordinary agent tool
access, enforced independently (see "Admin layer" in `docs/ARCHITECTURE.md`). You should
see Global Settings, User Credentials, Policy Documents, and a live module-status strip
showing your `ACTIVE_MODULES`.

## Step 5 — Install the agent (chat) app

```bash
cd frontend/agent
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5174`.

## Step 6 — Test with a demo install

This confirms the whole stack — backend, database, admin console, agent app, and (if you
completed Step 3) ERPNext — actually works end to end.

1. In ERPNext, create one user with the **Sales User** role, and 1–2 **Quotation** records
   so there's something for the agent to find.
2. Sign in to the agent app (`:5174`) as that user.
3. Ask it: **"list my quotations."** You should get a rendered table back — this is
   `quotation.list`, the one fully-wired capability in this tier (see
   `docs/ARCHITECTURE.md` for why only this one entity is populated and every other module
   is present-but-empty scaffolding).
4. Back in the admin console (`:5173`), confirm the module-status strip shows the
   modules from `ACTIVE_MODULES`, and that you can edit a setting.

If you skipped Step 3, you can still confirm the backend/database/frontends are correctly
wired by checking `GET /api/tools` returns a tool list once logged in via an
admin-provisioned credential — full ERP-backed testing needs Step 3 completed first.

## Optional: Docker (backend only)

`backend/Dockerfile` builds a production image (multi-stage, `node:20-alpine`) if you'd
rather not run the backend with `npm run dev` directly:

```bash
cd backend
docker build -t noviz-agent-backend .
docker run -p 4000:4000 --env-file .env noviz-agent-backend
```

The two frontend apps aren't containerized in this repo — `npm run build` produces static
output you can serve from any static host or reverse proxy (nginx, etc.), pointed at
`VITE_API_BASE` in each app's `.env`.

## Troubleshooting

- **Backend won't start** — check `DATABASE_URL` is reachable and every migration in
  `backend/src/db/migrations/` ran without error, in order.
- **Login fails against ERPNext** — confirm the API key/secret in `.env` are for a user
  with permission to call `getUserRoles`, and that `ERPNEXT_BASE_URL` has no trailing
  slash mismatch.
- **`allowed_tools` comes back empty** — the logged-in user's ERPNext role isn't mapped to
  any tools in `config/roles.policy.ts`. `Sales User` → `quotation.list` is the one mapping
  present in this tier.
- Anything else: report back with which step, the exact command, and the exact error
  message or response body.

## Precautions before you go live

Noviz is an AI ERP agent, and like any AI system, it can make mistakes. Review its outputs
before relying on them in production, and never let it make unsupervised decisions on
matters with serious financial, operational, or compliance consequences without human sign
off. If you complete [Step 3](#step-3-connect-an-erp-system-optional) against your own live
ERPNext data rather than a demo/reference database, treat every action the agent takes
there with the same review discipline you'd apply to a person new to the role. See the full
disclaimer at [noviz.in/responsible-ai.html](https://noviz.in/responsible-ai.html).

## Support

Questions about installing or extending this beyond what's documented here — including
custom connectors for a different ERP/business system, or a synthetic test database sized
to your needs (see [Step 3b](#3b-erpnext-referencedemo-database-optional)) — reach us at
**support@noviz.in**.
