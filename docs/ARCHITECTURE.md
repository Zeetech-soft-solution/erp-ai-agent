# ERP Agent — Extensible Core Architecture

## Design rule this whole codebase follows
No file depends on a concrete implementation — only on the interfaces in
`core/types.ts`. Concrete pieces (an LLM provider, a context source, a
renderer, an MCP module) are written once and *registered*, never
imported ad-hoc into logic that should stay generic. This is what lets
you add modules/providers later without touching the gateway, the
reasoning engine, or the auth flow.

```
core/types.ts            <- every contract (Session, ToolDefinition,
                             MCPModule, ContextProvider, LLMProvider,
                             RendererFn, InteractionLogger...)
core/moduleRegistry.ts   <- plugin registry for MCP modules/tools
core/gateway.ts          <- SINGLE enforcement + execution point for
                             every tool call (role check happens here,
                             nowhere else)
core/contextAssembler.ts <- runs hot+warm context providers within budget
core/reasoningEngine.ts  <- provider-agnostic LLM tool-calling loop
core/rendererRegistry.ts <- render-kind -> sanitized HTML

providers/llm/            <- OpenAIProvider today; add another class
                             implementing LLMProvider to swap later
providers/context/         <- sessionCacheProvider (hot), vectorContextProvider (warm)

modules/<name>/index.ts   <- one MCPModule per folder: crm, context,
                             tickets, email. Adding module #5 = new
                             folder + one line in bootstrap.ts's
                             AVAILABLE_MODULES map + ACTIVE_MODULES env var.

config/roles.policy.ts    <- RolePolicyProvider: role -> allowed tools.
                             Static file today; swap for a DB-backed
                             provider later without touching gateway.ts.
config/app.config.ts      <- every tunable (active modules, LLM config,
                             context budgets) — env-driven, one place.

renderers/                <- tableRenderer (generic, works for any
                             array-of-objects result) + escape.ts.
                             Add a chart/timeline renderer the same way.

routes/tools.routes.ts    <- GENERIC structured REST surface. Any tool
                             any module registers is reachable at
                             POST /api/tools/:toolName automatically —
                             no per-module route file needed, ever.
routes/agent.routes.ts    <- freeform chat entry point (/api/agent/prompt)
db/migrations/001_init.sql <- pgvector table + interaction_log table
```

## Request flow

```
POST /api/auth/login
  -> verify ERPNext credentials
  -> getUserRoles() [service API key]
  -> RolePolicyProvider.resolveAllowedTools(roles)
  -> issue agent JWT { sub, erpnext_roles, allowed_tools }

POST /api/agent/prompt   (Bearer agent JWT)
  -> ReasoningEngine.run(session, prompt)
     -> listAllowedTools(session)              [gateway, role-filtered]
     -> ContextAssembler.assemble()             [hot: session cache,
                                                  warm: pgvector search]
     -> LLMProvider.chat(messages, tools)        loop, up to N iterations
        -> for each tool_call: gateway.callTool()
           -> re-checks allowed_tools (never trusts the LLM)
           -> moduleRegistry.findTool().handler()
     -> extract DISPLAY_INTENT from final LLM text
     -> rendererRegistry.render(kind, data, intent) -> sanitized HTML
     -> InteractionLogger.log(...)               [training data, always on]
  <- AgentResponse { type, message, data, html, meta }
```

## Why context.lookup and context.search are TOOLS, not automatic

Hot (session cache) and warm (vector search) context are assembled
automatically on every prompt, within a fixed character budget, so the
LLM always has short-term continuity + relevant background for free.
But the COLD tier — a full, specific record fetch — is exposed as a
normal callable tool (`context.search`, `context.lookup`) so the model
asks for it only when it decides it needs more, the same way it asks
for any other MCP tool, under the same role gate.

## Extending the system (concrete recipes)

**Add a new ERP module (e.g. `hr`)**
1. `modules/hr/api.ts` — ERPNext REST calls for Employee, Leave Application, etc.
2. `modules/hr/index.ts` — export `hrModule: MCPModule` with a `tools[]` array.
3. In `bootstrap.ts`: `import { hrModule } from "./modules/hr"` and add `hr: hrModule` to `AVAILABLE_MODULES`.
4. Add `hr` to `ACTIVE_MODULES` in `.env`, and add its tool names to whichever roles in `roles.policy.ts` should have them.
No other file changes.

**Swap the LLM provider for your own model later**
Write `providers/llm/yourModelProvider.ts` implementing `LLMProvider`
(`chat(messages, tools): Promise<LLMResponse>`), then swap the
`new OpenAIProvider()` in `routes/agent.routes.ts` for
`new YourModelProvider()`. `reasoningEngine.ts` never changes.

**Move role policy into ERPNext/a database**
Write a `DatabaseRolePolicyProvider implements RolePolicyProvider` and
swap it in `auth/erpnextAuth.ts`. `gateway.ts` never changes — it only
ever reads `session.allowed_tools`, already resolved at login.

**Add a new report visual (e.g. a chart)**
Write `renderers/chartRenderer.ts`, call
`rendererRegistry.register("chart", renderChart)`, import it once
(side-effect) in `bootstrap.ts`. The LLM can start requesting
`"render":"chart"` in its `DISPLAY_INTENT` immediately.

## Per-user impersonation (not a shared service account)

Every business-data call — CRUD tools, workflow transitions — runs on
ERPNext (or whatever `SystemConnector` is active) **as the actual
logged-in person**, never as the agent's own service account. This
matters because ERPNext's own audit trail (`owner`, `modified_by` on
every record) needs to reflect who really acted, not "the agent."

**Two login modes, same guarantee:**

```
POST /api/auth/login { email, password }
  -> systemConnector.loginWithPassword()
  -> ERPNext /api/method/login, captures the returned session cookie
  -> UserCredential { mode: "session", sid: "..." }

POST /api/auth/login { email, apiKey, apiSecret }
  -> systemConnector.loginWithApiKey()
  -> validates the key actually belongs to that email
     (frappe.auth.get_logged_user), rejects otherwise
  -> UserCredential { mode: "api_key", apiKey, apiSecret }
```

Password mode is the familiar flow. API key mode — a user generates
their own personal key in ERPNext (*User → API Access → Generate
Keys*) and hands it to the agent once — avoids typing a password into
a third-party app, sidesteps 2FA entirely, and has no login-lockout
risk from repeated attempts. Both produce a `UserCredential`, and
every subsequent `list/get/create/update` call in
`erpnextConnector.ts` builds a fresh per-request HTTP client
authenticated as that credential (`clientFor()`) — the shared
service-level client (`erpnext/client.ts` default export) is used
**only** for `getUserRoles`, a privileged introspection call that
isn't a business transaction and doesn't need per-user attribution.

**Where the credential actually lives — this is the important part.**
The agent's JWT (held in the browser) carries only an opaque
`sessionId`, never the ERPNext session cookie or API key/secret
itself. The real `UserCredential` lives server-side only, in
`core/sessionStore.ts`. `auth/middleware.ts` resolves `sessionId ->
Session` (including the credential) on every request. This is
deliberately different from embedding the credential directly in the
JWT payload — a JWT is base64, not encrypted, so a leaked/stolen token
would otherwise hand over real ERPNext access, not just agent access.
With this design, a leaked JWT is useless without also compromising
the session store.

**Tradeoff worth knowing**: `sessionStore` is in-memory today, so
sessions don't survive a server restart and don't share across
multiple backend instances. Swap it for Redis (identical
create/get/destroy shape) the moment you run more than one instance or
need sessions to survive a deploy.

`POST /api/auth/logout` destroys the server-side session immediately
— the JWT itself may still parse as "valid" until it expires, but
`sessionStore.get()` will return `null`, so `requireAuth` rejects it.

## Persistent, admin-provisioned credentials

The two login modes above are still real, but there's now a third,
preferred path that doesn't require the user to authenticate to
ERPNext live on every login: an admin generates an API key for a user
directly in ERPNext (that user's profile → API Access → Generate
Keys) and provisions it once via the admin console (**User
credentials** page → `PUT /api/admin/users/:email/credential`).

```
core/credentialVault.ts       <- AES-256-GCM encrypt/decrypt, key from
                                  CREDENTIAL_ENCRYPTION_KEY (.env)
core/userCredentialStore.ts   <- user_credentials table: api_key
                                  plaintext (not secret alone),
                                  api_secret_enc ENCRYPTED, never
                                  returned in any API response after
                                  it's saved
routes/admin.routes.ts        <- validates the key against ERPNext
                                  (confirms it actually belongs to
                                  that email) BEFORE storing it —
                                  rejects a typo'd email silently
                                  attaching to the wrong identity
```

`auth/erpnextAuth.ts`'s `loginWithPassword()` now checks
`userCredentialStore` first: if an admin has provisioned a stored
credential for this email, that becomes the impersonation credential
for the session — the live ERPNext login is still performed (proves
the person's password is correct), but its session cookie is
discarded in favor of the stable, admin-provisioned key. If nothing's
been provisioned yet, it falls back to the session cookie from that
login, same as before — the system works before any admin
provisioning happens, and gets more stable as admin fills more in.

**This is why the secret is encrypted at rest and the earlier "no
secrets in the settings table" rule doesn't contradict it**: settings
are operational config anyone with admin access should be able to
read; `user_credentials.api_secret_enc` is a real secret, stored
specifically to be *write-only* from the admin UI's perspective —
`GET /api/admin/users` returns only `api_key` (not secret alone) and
metadata, never `api_secret`. Rotating or revoking a credential
(`DELETE /api/admin/users/:email/credential`) also calls
`sessionStore.destroyAllForUser()`, so any session already in a
browser can't keep acting under a revoked key until it happens to expire.

## System-agnostic core (ERPNext today, SAP or any other business system tomorrow)

This is the most important boundary in the codebase, so it's worth
stating as a rule: **nothing in `core/`, `modules/`, `routes/`, or the
reasoning engine may ever import an ERPNext-specific path, doctype
name, or field name.** Everything speaks in *canonical* entity/field
names and goes through one interface:

```
core/types.ts          <- SystemConnector interface (loginWithPassword,
                           loginWithApiKey,
                           getUserRoles, list/get/create/update — all
                           canonical in, canonical out)
core/entityModuleFactory.ts <- generates tools from EntityConfig,
                           calling ONLY systemConnector
config/entities.config.ts   <- canonical entity/field names, zero
                           system-specific vocabulary anywhere in this file
config/system.config.ts     <- the ONE switch point: picks which
                           SystemConnector implementation to instantiate,
                           based on SYSTEM_PROVIDER

erpnext/client.ts        <- low-level ERPNext REST wrapper (paths,
                           /api/resource/<doctype>, etc.)
erpnext/entityMap.ts     <- canonical <-> ERPNext-native field/doctype
                           translation table — THE file that changes
                           if ERPNext renames a field or you repoint
                           an entity at a different doctype
erpnext/erpnextConnector.ts <- implements SystemConnector using the two
                           files above; the ONLY file that knows
                           ERPNext's JSON shape

sap/README.md             <- checklist for adding sap/entityMap.ts +
                           sap/sapConnector.ts later — same shape,
                           zero changes anywhere else
```

**What "a second business system tomorrow" actually costs**,
concretely: write `sap/entityMap.ts` (canonical entityKey -> native
object + field names) and `sap/sapConnector.ts` (implements
`SystemConnector`), register it in `config/system.config.ts`, flip
`SYSTEM_PROVIDER=sap`. `entities.config.ts`, `workflows.config.ts`,
`roles.policy.ts`, `crm/index.ts`, `gateway.ts`, `reasoningEngine.ts`,
`workflowEngine.ts`, every renderer, and both frontends are
unaffected — they never knew which system they were talking to in the
first place. This isn't specific to SAP either: the same steps apply
to a healthcare EMR, a banking core, a logistics TMS, or any other
system that has entities, roles, and processes.

Hand-written modules (like `modules/crm/`, for entities that need real
business logic beyond raw CRUD) follow the identical rule: they call
`systemConnector.<method>(...)`, never ERPNext's client directly — same
discipline as the generic entity factory. **Free tier note**: `crmModule`
ships with `tools: []` today — the folder and the pattern are here to
read, but its business logic is a pro-tier capability. `modules/selling`
(via the generic entity factory, not hand-written) is this tier's one
populated example instead — see the taxonomy section below.

## The domain-agnostic core principle (read this first)

Everything below assumes one rule: **the true "core" — `core/gateway.ts`,
`core/reasoningEngine.ts`, `core/moduleRegistry.ts`,
`core/contextAssembler.ts`, `core/entityModuleFactory.ts`,
`core/workflowEngine.ts`, `core/rendererRegistry.ts` — must never
contain a single word specific to ERP, ERPNext, or any business
vertical.** It's built from five universal primitives that describe
*any* business operation, in any domain:

| Primitive | What it models | Same shape in ERP, healthcare, banking, logistics? |
|---|---|---|
| `Session` | an actor with roles | yes — always "who, with what permissions" |
| `EntityConfig` + `SystemConnector` | a resource you can list/get/create/update | yes — a Lead, a patient record, an account, a shipment are all "an entity with canonical fields" |
| `RolePolicyProvider` | who can do what | yes — role-to-permitted-action mapping is universal |
| `WorkflowDefinition` | a process as named states + named transitions | yes — approval chains, admissions, claims, fulfillment are all state machines |
| `ToolDefinition` / `MCPModule` | a callable unit of work, gated and logged | yes — the LLM-facing surface is identical regardless of what's behind it |

What changes per business vertical is **only** the configuration built
from these primitives — `config/entities.config.ts`,
`config/workflows.config.ts`, `config/roles.policy.ts`, and one
`SystemConnector` implementation (`erpnext/erpnextConnector.ts` today).
Together, those four things form what's worth calling a **domain
pack** — a self-contained description of one business vertical's data
shape, processes, and permission model. Building the same core for a
different ERP tomorrow, or for an entirely different business (not ERP
at all — say, a hospital operations system, or a lending platform) is
writing a new domain pack, never touching core.

## Complex operations = workflows, not just CRUD

The piece that was actually missing for "complex domain operations":
CRUD tools alone can't express an approval chain or a multi-step
process — that requires a **state machine**. `core/workflowEngine.ts`
+ `core/workflowToolFactory.ts` add this as a first-class, equally
domain-agnostic primitive:

```
config/workflows.config.ts   <- WorkflowDefinition[]: entityKey +
                                 statusField + transitions (action,
                                 from-states, to-state, optional
                                 allowedRoles) — describes ANY approval/
                                 process flow, not ERP-specific
core/workflowEngine.ts        <- validates a transition is legal from
                                 the entity's current state, checks
                                 transition-level role gate, applies it
                                 via systemConnector.update() — never
                                 touches ERPNext/SAP/anything directly
core/workflowToolFactory.ts   <- turns every transition into an
                                 ordinary MCP tool (e.g.
                                 "lead_qualification.convert"), so it
                                 gets identical gateway role-gating,
                                 audit logging, and LLM tool-calling
                                 treatment as any CRUD tool — no special
                                 casing anywhere else in the system
```

Note the **double gate** by design: a role must have the tool in
`allowed_tools` (visibility/callability, same as any tool) *and* pass
`transition.allowedRoles` if the specific transition sets one (e.g. a
Sales User can call `lead_qualification.qualify` but only a Sales
Manager can complete `.convert`, even though both roles can see the
workflow exists). This maps directly onto how real approval chains
work — junior roles can act up to a point, a narrower set of roles
completes the sensitive step.

**Free tier note**: `config/workflows.config.ts` is intentionally empty
(`WORKFLOW_CONFIGS: WorkflowDefinition[] = []`) in this tier — a working
workflow (state machine + double-gated transitions, e.g. a lead or
quotation approval chain) is a pro-tier capability. The engine
(`core/workflowEngine.ts` / `core/workflowToolFactory.ts`) is fully
present and domain-agnostic either way; only the config is empty. To add
your own: populate `WORKFLOW_CONFIGS` with an entry naming a real
`entityKey`, its `statusField`, and its transitions — the identical shape
describes a purchase approval chain, an insurance claim process, or a
patient admission flow in a completely different vertical. The engine
doesn't change; only the config does.

## Standard ERP module taxonomy (the entity factory, organized)

Hand-writing a `modules/<name>/index.ts` per entity doesn't scale to
"all of ERPNext" — and it especially doesn't scale to "ERPNext today,
SAP tomorrow." `core/entityModuleFactory.ts` generates
`list/get/create/update` tools for any canonical entity from a
declarative config. That config is organized around the standard ERP
module taxonomy most mainstream ERPs echo in some form — CRM, Selling,
Buying, Stock, Accounting, HR, Manufacturing, Projects, Assets, Quality
Management — one real folder per module (`config/modules/<name>/`),
each holding that module's entities, business rules, and
training-curation metadata together:

```
config/modules/crm/{entities,rules,training}.ts
config/modules/selling/{entities,rules,training}.ts
config/modules/buying/{entities,rules,training}.ts
config/modules/stock/{entities,rules,training}.ts
config/modules/accounting/{entities,rules,training}.ts
config/modules/hr/{entities,rules,training}.ts
config/modules/manufacturing/{entities,rules,training}.ts
config/modules/projects/{entities,rules,training}.ts
config/modules/assets/{entities,rules,training}.ts
config/modules/quality/{entities,rules,training}.ts

config/entities.config.ts   <- imports + spreads every module's entities.ts
config/rules.config.ts      <- imports + spreads every module's rules.ts
config/training.config.ts   <- imports + spreads every module's training.ts
                                (none of the three aggregators need editing themselves)

erpnext/entityMaps/<same-module-names>.ts  <- ERPNext-specific mirror,
                                one file per module, each resolving
                                that module's canonical entityKeys to
                                ERPNext doctypes + native field names.
                                Deliberately NOT inside config/modules/ —
                                this is the one thing kept ERP-specific
                                and separate from the canonical folder,
                                so a future sap/entityMaps/ can mirror
                                it without touching canonical config.
erpnext/entityMap.ts        <- imports + spreads all of the above
```

**Almost every module is an empty stub in this tier.** Only `selling`
has real content — one entity (`quotation`), one operation (`list`), and
one reference rule in `rules.ts`. Every other module's `entities.ts`,
`rules.ts`, and `training.ts` (including `crm`'s) exports an empty array,
on purpose — the folder shape is complete and consistent, ready for
pro-tier depth, but the business content itself isn't here.

**If you want to add your own entity or rule**, that's exactly what these
files are for:
- `config/modules/<name>/entities.ts` — add an `EntityConfig` (see
  `selling/entities.ts` for the shape) to get free `list/get/create/update`
  tools generated automatically.
- `config/modules/<name>/rules.ts` — add a `RuleSet` (see
  `selling/rules.ts` for the shape) to gate create/update on real business
  logic.
- Then grant the new tool name(s) to a role in `config/roles.policy.ts` —
  a tool existing never implies access.

No other file needs to change for either addition.

Support and Email are deliberately **not** part of this taxonomy today.
They exist only as hand-written, external-system stubs
(`src/modules/tickets/`, `src/modules/email/` — read `tickets.list`/
`email.list`/`email.draft`'s doc comments: they're meant to integrate
an *external* helpdesk/mailbox, not ERPNext's own Issue/Communication
doctypes). More `config/modules/<name>/` folders can be added the same
way as this session's Assets/Quality additions once there's an actual
requirement for them.

**To adjust one module's schema** — say ERPNext renames a field, or
you want to add a new doctype to Buying — open exactly
`config/modules/buying/entities.ts` (canonical shape) and
`erpnext/entityMaps/buying.ts` (ERPNext-specific translation). Nothing
else in the system needs to change or even be aware the edit happened;
the tool description handed to the LLM, the role policy, the gateway,
the renderer are all identical before and after.

**To add real business-rule coverage to a module**: fill in its
`config/modules/<name>/rules.ts` following `crm/rules.ts` or
`selling/rules.ts`'s shape — no gateway or module-registration change
needed. `core/entityModuleFactory.ts` tags every generated create/
update tool with its `entityKey` automatically, so
`core/businessRuleEngine.ts` picks up a newly-populated `RuleSet`
immediately; entities with no rules registered simply get a no-op
check.

**To add a new module entirely**: create
`config/modules/<name>/{entities,rules,training}.ts` and
`erpnext/entityMaps/<name>.ts` following the existing modules' shape,
import + spread all four into their respective aggregators. That's the
whole change.

Keep hand-written modules (like `crm/`'s `lead` entity) for anything
that needs real business logic beyond raw CRUD. Everything else goes
through the factory — one config entry, zero new route/tool files —
and works unchanged regardless of which `SystemConnector` is active.

**Important**: the factory only makes a tool *callable* — it grants no
access by itself. Every generated tool name (`sales_order.list`, etc.)
still has to be added to the relevant role(s) in `roles.policy.ts`
before anyone can use it, same as any hand-written tool.

## Reporting — the other universal ERP operation

CRUD covers records; it doesn't cover **named reports** (a trial
balance, a stock ledger, an aging report) — every ERP has some version
of "run this pre-defined report with these filters, get tabular rows
back," using its own internal mechanism. This gets the exact same
canonical/connector treatment as entities:

```
core/reportModuleFactory.ts   <- generates one MCP tool per report,
                                  calling ONLY systemConnector.runReport()
config/reports.config.ts      <- canonical reportKey + module +
                                  canonical filter field names, zero
                                  ERP-specific report names
erpnext/reportMap.ts          <- resolves canonical reportKey to
                                  ERPNext's actual report name +
                                  filter key names; the ONLY file that
                                  knows ERPNext runs every standard
                                  report through one generic endpoint
                                  (frappe.desk.query_report.run)
```

Add `reports` to `ACTIVE_MODULES` to load `config/reports.config.ts`.
Three examples are wired against real ERPNext standard reports (Stock
Balance, General Ledger, Accounts Receivable) — **verify the exact
report names and filter keys against your ERPNext version before
relying on them**; report output shape (columns as strings vs objects,
rows as arrays vs dicts) varies by report type, and
`erpnextConnector.ts`'s `normalizeReportResult()` does its best-effort
to flatten either shape into plain objects. Adjust there if a specific
report doesn't normalize cleanly.

## Agent-facing app (the core deliverable)

`frontend/agent/` — React + Vite + TS, one codebase for both mobile and
desktop. Login lands directly on the prompt/chat screen
(`pages/Chat.tsx`). Responsive behavior is CSS-driven, not two separate
code paths: below 900px it's a single-column chat; at 900px+ a
`DetailPanel` appears (capabilities list, more visibility — the
"desktop has more features" requirement) without any JS branching.

- `ResponseView.tsx` renders the exact `AgentResponse` contract:
  `text` → plain bubble, `report` → the server-rendered sanitized HTML
  dropped in directly, `document` → a download card. Next-step buttons
  inside report HTML are wired via event delegation, so clicking one
  sends a new prompt exactly like typing it.
- `DetailPanel.tsx` calls `/api/agent/capabilities` — same generic
  gateway-filtered list the admin console's tool count comes from,
  just user-facing here.

## Admin layer (settings, separate trust boundary)

Admin access (global settings, later: role-policy editing, audit log
viewing) is a **different permission check from agent tool access** —
it's a plain role allow-list (`ADMIN_ROLES` in `.env`, default
`System Manager`), enforced by `auth/adminMiddleware.ts`, deliberately
kept separate from `allowed_tools` because settings CRUD is never
something the LLM itself calls.

- `settings` table: DB-backed, hot-reloadable, **operational only**
  (context budgets, LLM model name, max tool iterations, org display
  name, maintenance mode). Cached in-process with a short TTL so the
  reasoning engine isn't hitting Postgres on every prompt.
- Secrets (ERPNext API key/secret, JWT secret, LLM API key, DB URL)
  **never** move into this table — they stay in `.env`, not editable
  from the admin UI, on purpose.
- `admin_audit_log` records every settings change (who, what, before/after).
- `frontend/admin/` — React + Vite + TS, desktop-only (`min-width: 1024px`
  by design, no responsive breakpoints — this is an internal tool, not
  a public surface). Currently: login + Global Settings + User Credentials +
  Policy Documents pages + live module-status strip. Add a new admin section
  the same way `Settings.tsx` was added: a page component + a `<Route>` in
  `App.tsx` + a `<NavLink>` in `Sidebar.tsx`.

### Policy documents (RAG over admin-uploaded business policy)

`core/policyDocumentStore.ts` + `routes/policyDocuments.routes.ts` let an
admin upload a `.docx` of business policy / workflow rules from
`frontend/admin/`'s Policy Documents page. Text is extracted with
`mammoth`, chunked (~1200 chars, paragraph-aware), embedded via whichever
`Embedder` `bootstrap.ts` wired into `vectorContextProvider`
(`providers/embeddings/openaiEmbedder.ts` today — same
swap-one-class-and-nothing-else discipline as `LLMProvider`), and stored
in `context_embeddings` with `owner_scope = 'global'`, tagged back to a
first-class `policy_documents` row via `policy_document_id`. Editing or
reactivating a document deletes and re-embeds its chunks — never leaves
stale embeddings behind. This is also what finally wires a real
`Embedder` into `vectorContextProvider`, which previously had the
interface but nothing calling `setEmbedder()` — so it's a live no-op
until `EMBEDDINGS_API_KEY`/`LLM_API_KEY` is set.

## Database summary

One self-hosted Postgres instance (with the `vector` extension) backs
everything agent-side — never touches ERPNext's own database:
- `context_embeddings` — warm-tier semantic search (pgvector)
- `interaction_log` / `rule_evaluations` — every reasoning-engine run and
  business-rule check, training-data source (see `docs/TRAINING_PLAN.md`)
- `policy_documents` — admin-uploaded policy/reference docs backing the
  `context_embeddings` rows they were chunked into
- `settings` / `admin_audit_log` — admin-editable operational config

## Setup

See `docs/TESTING_GUIDE.md` for the full step-by-step version. Short form:

1. `cd backend && npm install`
2. `cp .env.example .env` and fill in ERPNext URL/key, LLM key, `DATABASE_URL`, `ADMIN_ROLES`,
   and `CREDENTIAL_ENCRYPTION_KEY` (generate with the node command in the `.env.example` comment)
3. Run every file in `db/migrations/` against your Postgres (with pgvector installed), in
   filename order
4. `npm run dev`
5. Create one ERPNext user with the **Sales User** role and confirm `/api/auth/login`
   returns `allowed_tools: ["quotation.list"]`
6. Test `/api/tools` (list) and `/api/tools/quotation.list` (POST) with that token
7. `cd ../frontend/admin && npm install && cp .env.example .env && npm run dev`
8. Sign in with a `System Manager` (or whatever `ADMIN_ROLES` lists) user,
   confirm the module-status strip shows your active modules, edit a setting
9. `cd ../frontend/agent && npm install && cp .env.example .env && npm run dev`
10. Sign in as any role, send a prompt like "list leads" — you should see the
    generic table renderer output; resize the window past 900px to see the
    desktop detail panel appear
