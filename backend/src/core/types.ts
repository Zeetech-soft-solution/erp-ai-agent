/**
 * CORE CONTRACTS — every other file depends on these interfaces, never
 * on a concrete implementation. Swapping the LLM provider, the vector
 * DB, a renderer, or adding a new MCP module must NEVER require
 * touching this file or the gateway/engine that consume it.
 */

// ---- Session / Auth ----
// UserCredential is an OPAQUE blob from core's point of view — only the
// active SystemConnector implementation knows how to interpret it (an
// ERPNext session cookie, an ERPNext personal API key/secret, an SAP
// OAuth token, whatever). Its presence on Session is what makes every
// business-system call happen AS the actual person, not a shared
// service account — which matters for that system's own audit trail
// (owner/modified_by on every record it creates).
export interface UserCredential {
  mode: string;                  // e.g. "session" | "api_key" — connector-defined
  [key: string]: string;         // connector-defined fields (sid, apiKey, apiSecret, token, ...)
}

export interface Session {
  sub: string;                 // business-system user identifier (e.g. ERPNext email)
  erpnext_roles: string[];
  allowed_tools: string[];     // resolved at login, "*" means all
  credential: UserCredential;  // used to impersonate this user on the connected system
  // Set by auth/middleware.ts when reconstructing a session from
  // sessionStore for an authenticated request — undefined only in the
  // brief window auth/erpnextAuth.ts constructs a Session literal
  // BEFORE sessionStore.create() has minted its id (chicken-and-egg:
  // the store assigns the id, so the object can't carry it yet at that
  // point). Every real consumer (gateway, reasoningEngine,
  // sessionCacheProvider) only ever sees req.session from an
  // authenticated request, where this is always populated — added so
  // sessionCacheProvider can key chat memory per LOGIN, not per user
  // email: confirmed live, keying by email meant a second login (or
  // even the same account tested repeatedly) inherited another active
  // session's leftover conversation state.
  sessionId?: string;
}

// ---- Tools (the unit every MCP module exposes) ----
export interface ToolDefinition {
  name: string;                 // "<module>.<action>", globally unique
  description: string;          // shown to the LLM — keep it precise
  module: string;
  parameters?: Record<string, any>; // JSON schema for LLM tool-calling
  handler: (args: any, session: Session) => Promise<any>;
  // Opt a tool into business-rule enforcement (see core/businessRuleEngine.ts).
  // Left undefined for tools with no registered RuleSet — gateway.ts skips
  // the check entirely for those, so this is additive and never breaks an
  // existing tool that doesn't opt in.
  entityKey?: string;
  ruleAction?: "create" | "update";
  // System-prompt rule blocks this tool needs the model to have READ to
  // use it correctly (e.g. DATA_QUERY_DISCIPLINE for the query tools,
  // WRITE_OPERATIONS for .create/.update). The relay injects these into
  // the live system message the moment the tool's schema is REGISTERED
  // for a turn (relayReasoningEngine.ts) — so the model's first call is
  // already well-formed. The blocks are the unchanged constants from
  // systemPrompt/core/* ; a tool declares its own here, nothing scans a
  // separate table. Entity .list/.get carry none — their keyword-matched
  // MODULE section already covers them.
  promptRules?: string[];
}

// ---- MCP Module (the unit you add to extend the system) ----
export interface MCPModule {
  name: string;                 // e.g. "crm", "tickets", "email", "context"
  description: string;
  tools: ToolDefinition[];
}

// ---- Role policy (who can call what) ----
// System-agnostic on purpose, same as SystemConnector: `roles` is
// whatever role/authorization strings that system's own
// SystemConnector.getUserRoles() returned — this interface never knows
// or cares whether they're ERPNext role names, SAP authorization
// profiles, or an Odoo group's technical name. See config/rolePolicy.config.ts
// for how the concrete provider is selected.
export interface RolePolicyProvider {
  resolveAllowedTools(roles: string[]): Promise<string[]> | string[];
}

// ---- Context (hot/warm/cold retrieval) ----
export interface ContextChunk {
  source: "session_cache" | "vector" | "controller";
  label: string;
  content: string;
  score?: number;
}

export interface ContextProvider {
  name: string;
  /** Return relevant chunks within a rough character budget. */
  fetch(session: Session, prompt: string, budgetChars: number): Promise<ContextChunk[]>;
}

// ---- LLM Provider (swap OpenAI-compatible -> your own model later) ----
export interface LLMToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  // Present on an "assistant" message that made tool calls this turn —
  // provider-agnostic; each LLMProvider translates this into its own
  // wire format (see openaiProvider.ts) when replaying history back.
  tool_calls?: LLMToolCall[];
}

export interface LLMResponse {
  content: string | null;
  tool_calls: LLMToolCall[];
  // Real OpenAI-reported token counts for this one completion — present
  // whenever the provider's own response includes a "usage" object
  // (every real OpenAI-compatible call does). Optional because
  // LLMProvider is a generic interface: a future/local provider that
  // genuinely can't report usage shouldn't be forced to fake a number.
  // Only the multi-tenant relay (relayReasoningEngine.ts) actually
  // consumes this today — see tenantUsageService.ts — the single-tenant
  // product has no shared-key usage-attribution problem to solve, so it
  // simply ignores the field.
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface LLMProvider {
  // tenantId is optional and RELAY-only (the local single-tenant engine's
  // own call sites never pass it — see concurrencyGate.ts's own doc
  // comment for why an absent tenantId still behaves correctly, just
  // without the per-tenant fairness sub-cap). Real gap found 2026-08-19:
  // the concurrency gate's own FIFO queue is fair in ORDER (first request
  // waits least) but not in SHARE — nothing stopped one tenant's own
  // burst of requests from filling every one of the shared
  // MAX_CONCURRENT_REQUESTS slots at once, starving every other tenant
  // until that burst cleared, even though each individual wait was
  // "fair" by arrival order.
  chat(messages: LLMMessage[], tools: ToolDefinition[], tenantId?: string): Promise<LLMResponse>;
}

// ---- Response contract returned to the frontend ----
// "report" here means a rendered HTML table view (data + html) — an
// unrelated, pre-existing meaning from "report_download" below, which is
// report.generate's single downloadable-link result. Two different
// shapes that happen to both involve the word "report" in casual
// speech, kept as distinct type strings on purpose (confirmed live
// 2026-08-17: reusing "report" for report.generate's result collided
// with this existing type and would have rendered as a raw HTML-table
// branch with no html field, not a download button).
export type AgentResponseType = "text" | "report" | "document" | "report_download" | "action_result";

// Real, explicit product ask (2026-08-21): "in ur next row button just
// hide prompt send change this query to next page thats it" — a plain
// string next_step shows the SAME text as both the visible button
// label and the literal prompt sent when clicked (the model's own
// "Mark as won"-style steps). A server-injected pagination step needs
// those to differ: a friendly visible label ("Show me more") but a
// precise internal instruction the person never sees typed into their
// own chat history. `hidden: true` tells the frontend to skip adding
// that action text as a visible user message bubble.
// Real, explicit product ask (2026-08-22): "u generate next page urself
// too... now it needs to send llm, remove that" — the server already
// knows the exact next query (same tool/args, pageIndex+1) with zero
// reasoning required, yet every pagination click still paid for a full
// real LLM round trip just to have the model repeat an instruction back
// verbatim. `query` carries that same {tool, args} pair structurally —
// when present, the frontend calls POST /turn/next-page directly
// (relay.routes.ts) instead of routing the click through send()/
// /turn, skipping the LLM call entirely. `action` stays populated too,
// as a fallback for any older plugin build that doesn't know about
// `query` yet.
export type NextStep = string | { label: string; action: string; hidden?: boolean; query?: { tool: string; args: Record<string, any> } };

export interface DisplayIntent {
  render: "table" | "chart" | "cards" | "timeline" | "raw" | "none" | "document";
  highlight?: string[];
  next_steps?: NextStep[];
  // Which tool call (exact name, e.g. "quotation.list") this render is
  // based on — only meaningful/required when more than one *.list/*.get/
  // report-style tool was called in the same turn, so reasoningEngine.ts
  // knows which of several results to actually show, instead of always
  // defaulting to whichever tool happened to run last (confirmed live:
  // that default silently mismatched the reply text to a stale/unrelated
  // table more than once). Omit on a single-tool-call turn — reasoningEngine
  // falls back to that turn's one result either way.
  source?: string;
  // Real, live-found bug (2026-08-24): a grouped/joined table's own
  // clickable first-column link ("Show full details of X") only ever
  // carried the bare display value — no indication of WHAT KIND of
  // record X actually is. The model then had to guess which tool
  // resolves it (tools.search, communication.get, ... all tried and
  // failed live before landing on the right customer.list call).
  // entityKey (e.g. "customer", "supplier") lets tableRenderer.ts embed
  // the real category directly into the action text the model reads on
  // its very next turn — no guessing required. Omit when the render
  // isn't grouped/joined (a plain .list/.get's own "id" column already
  // reads unambiguously from its own row shape).
  entityKey?: string;
  // Real, common rendering gap found live 2026-08-18: a table always
  // showed every canonical column the entity has (id/party/status/
  // total/date/valid_till/owner/modified, 8 for quotation), even when
  // the user's own question only asked about two of them ("list
  // quotations by company name and price") — and the model's own prose
  // answer would ALSO re-list every row in full text ABOVE that
  // oversized table, the same data rendered twice in two different
  // shapes. Set this when the question genuinely only cares about a
  // few fields — canonical names, in the order you want them shown
  // (e.g. ["party","total"]). "id" is added automatically if the row
  // has one (the clickable row-link — every real answer should still
  // let someone drill into a specific record, "as usual", whether or
  // not you list it here). Omit entirely for a genuinely broad "list
  // everything" question — every canonical field still shows, same as
  // before this existed.
  columns?: string[];
}

export interface AgentResponse {
  type: AgentResponseType;
  message: string;
  data?: any;
  html?: string;                 // server-rendered, sanitized — "report" only
  document?: { name: string; url?: string; content?: string };
  report?: { name: string; url: string };  // report_download only
  // The interaction_log row id this turn was recorded under, so the UI
  // can round-trip a thumbs up/down back via POST /api/agent/feedback/:id.
  // Absent when logging is a no-op (no DATABASE_URL).
  interaction_id?: string;
  meta: {
    modules_used: string[];
    tools_used: string[];
    role_context: string[];
  };
}

// ---- Renderer (turns data + display intent into sanitized HTML) ----
export type RendererFn = (data: any, intent: DisplayIntent) => string;

// ---- Interaction logging (training data plan — see docs/TRAINING_PLAN.md) ----
export interface InteractionRecord {
  actor_email: string;
  roles: string[];
  prompt: string;
  context_sources_used: string[];   // labels only, never full raw text
  tool_calls: { name: string; args: any }[];
  response_type: AgentResponseType;
  render_kind?: string;
  latency_ms: number;
  created_at: string;
}

export interface InteractionLogger {
  /** Returns the logged row's id (for the feedback round-trip below), or
   *  null when logging is a no-op (no DATABASE_URL configured). */
  log(record: InteractionRecord): Promise<string | null>;
  /** Phase 1 of the training plan: attach a thumbs up/down to a previously
   *  logged interaction. Scoped to actorEmail so a user can only rate
   *  their own turns. No-op (resolves false) without DATABASE_URL. */
  setFeedback(id: string, actorEmail: string, feedback: 1 | -1 | null): Promise<boolean>;
}

// ---- ERP Connector — THE boundary that makes ERPNext today / SAP
// tomorrow a non-event for core logic. Nothing in core/, modules/, or
// routes/ may ever call an ERPNext (or SAP) SDK/REST path directly —
// everything goes through this interface. Every method speaks in
// CANONICAL entity/field names (see EntityConfig below); each
// connector implementation is responsible for translating canonical
// <-> its own system's native paths, doctypes/objects, and field
// names, and for translating results back to canonical shape before
// returning. Swapping ERPs is: write one new class implementing this
// interface + one new entity map file. Nothing else changes.
//
// IMPERSONATION: list/get/create/update all take a UserCredential and
// MUST perform the call as that specific person on the underlying
// system — never the agent's own service account — so the system's
// own audit trail (owner/modified_by) reflects who actually acted.
// The service-level credential (config/app.config.ts) is reserved for
// system-level introspection (getUserRoles) and the login handshake
// itself, never for business-data reads/writes.
export interface SystemConnector {
  /** Password login — returns a UserCredential (e.g. a session cookie)
   *  to impersonate this person on every subsequent call. */
  loginWithPassword(identifier: string, password: string): Promise<UserCredential>;
  /** Personal API key login — user generated their own key/secret on
   *  the business system and handed it to the agent once. Returns a
   *  UserCredential built from it (validated against the system). */
  loginWithApiKey(identifier: string, apiKey: string, apiSecret: string): Promise<UserCredential>;
  /** Fetch the roles/permissions group(s) assigned to a user — a
   *  privileged introspection call, allowed to use the service
   *  credential since it's not a business transaction. */
  getUserRoles(identifier: string): Promise<string[]>;

  /** Does this set of roles count as a full-access administrator on the
   *  underlying system — ERPNext's "System Manager"/"Administrator", a
   *  future SAP connector's own equivalent ("SAP_ALL" or whatever),
   *  whatever that system calls it? Connector-defined on purpose: no
   *  role name belongs in core/gateway/auth code. Used only to decide
   *  whether READS may fall back to the service-level credential when
   *  the person's own real access is narrower than their admin role
   *  implies (see auth/erpnextAuth.ts) — writes always stay on the
   *  person's own credential regardless of this, so the audit trail
   *  (owner/modified_by) never lies about who acted. */
  isFullAccessRole(roles: string[]): boolean;

  /** The deployment's own company name (e.g. ERPNext's Global Defaults
   *  default_company) — privileged, deployment-wide introspection, same
   *  justification as getUserRoles: it's not a business transaction, and
   *  there's no per-user "which company am I" concept to impersonate.
   *  Returns null rather than throwing when unavailable (a missing/
   *  misconfigured default_company shouldn't break login or chat) — the
   *  reasoning engine treats null as "omit from context", not an error. */
  getCompanyName(): Promise<string | null>;

  /** sortBy is a canonical field name; sortDir defaults to "desc" — lets
   *  callers ask for "the latest N" or "the oldest N" instead of
   *  everything coming back in whatever order the underlying system
   *  happens to store it in (not necessarily creation order). */
  list(entityKey: string, credential: UserCredential, params?: { filters?: Record<string, any>; limit?: number; offset?: number; sortBy?: string; sortDir?: "asc" | "desc" }): Promise<any[]>;
  get(entityKey: string, credential: UserCredential, id: string): Promise<any>;
  create(entityKey: string, credential: UserCredential, canonicalData: Record<string, any>): Promise<any>;
  update(entityKey: string, credential: UserCredential, id: string, canonicalData: Record<string, any>): Promise<any>;
  /** Real doc submission (Draft -> Submitted) — a distinct action from
   *  update(), not a field write. See erpnextConnector.ts's own doc
   *  comment on why this is real (Frappe's REST API treats docstatus as
   *  a plain settable field), not a stub. */
  submit(entityKey: string, credential: UserCredential, id: string): Promise<any>;

  /** Runs a named, pre-defined report and returns tabular rows — the
   *  OTHER universal ERP operation besides CRUD (every ERP has some
   *  form of "run this named report with these filters, get rows
   *  back": financial statements, stock ledgers, aging reports...).
   *  Same discipline as list/get/create/update: canonical reportKey
   *  in, canonical column names out — each connector's report map
   *  resolves reportKey -> whatever that system's actual reporting
   *  mechanism is (ERPNext's query report runner, a SAP report ID,
   *  a raw SQL view, whatever). */
  runReport(reportKey: string, credential: UserCredential, filters?: Record<string, any>): Promise<any[]>;

  /** Server-side numeric aggregation — SUM/AVG/COUNT/MIN/MAX over a
   *  canonical entity's numeric field, optionally broken down by a
   *  groupBy field, using the SAME filters shape as list(). Exists so
   *  "what's the average X" / "how many Y" never becomes the LLM
   *  eyeballing rows out of its own context and adding them up itself —
   *  same tool-augmented-arithmetic discipline as Toolformer/ReAct:
   *  the model calls this and trusts the returned number, it never
   *  computes the number. See modules/analytics/index.ts. Percentage
   *  questions ("what % of X are Y") are NOT a separate connector
   *  method — they're composed from two op:"count" calls at the tool
   *  layer (modules/analytics/index.ts), same as list()'s filters
   *  already compose into everything else. */
  aggregate(
    entityKey: string,
    credential: UserCredential,
    params: { field?: string; op: "sum" | "avg" | "count" | "min" | "max"; filters?: Record<string, any>; groupBy?: string }
  ): Promise<{ overall: { value: number; count: number }; groups?: { key: string; value: number; count: number }[] }>;

  /** Exact, server-computed row count for a filtered entity query — zero
   *  rows fetched (ERPNext: frappe.client.get_count, a real COUNT(*)-style
   *  call, not a paged fetch). This is the cheap pre-check aggregate() now
   *  runs before deciding whether it can safely reduce over every matching
   *  row directly, or needs to bisect a date-range filter into smaller
   *  chunks first (see aggregate()'s own doc comment above and
   *  erpnextConnector.ts's AGGREGATE_ROW_CAP) — "without losing time to
   *  read everything to know the total" was the explicit ask this exists
   *  for. Also directly answers a bare op:"count" aggregate with no
   *  groupBy (no row fetch needed at all in that case). */
  count(entityKey: string, credential: UserCredential, filters?: Record<string, any>): Promise<number>;

  /** Renders a single record as a PDF via that system's own print/
   *  document-generation engine (ERPNext: Print Format -> PDF) and
   *  returns the raw bytes — what "give me the PDF of this invoice"
   *  resolves to. Called from a document-download route (see
   *  routes/agent.routes.ts), never fed into the LLM's own context —
   *  binary data has no business going through a tool-call round trip. */
  getDocumentPdf(entityKey: string, credential: UserCredential, id: string): Promise<{ filename: string; contentType: string; buffer: Buffer }>;

  /** Records a payment against a Sales Invoice (canonical entityKey
   *  "sales_invoice" — invoiceId is its real id). Deliberately NOT a
   *  generic payment_entry.create built from flat fields the way
   *  quotation/sales_order line items are: which account actually
   *  receives the money, the currency, and the exact allocation against
   *  the invoice are real accounting logic this system already computes
   *  correctly server-side (ERPNext: Payment Entry's own
   *  get_payment_entry()) — reconstructing that by hand here risks
   *  getting the receiving account wrong on a real financial record.
   *  amount omitted means "pay the invoice's real current outstanding
   *  amount in full" (never guessed — read from the invoice itself).
   *  Created AND submitted for real — unlike every other *.create tool in
   *  this app (which stay Draft), per explicit product decision
   *  2026-08-17: this tool's own ruleAction:"create" already requires an
   *  explicit confirm-before-create round trip showing the real invoice/
   *  amount/party, and that confirmation IS the human review step for
   *  this action — see modules/paymentEntry/index.ts's own tool
   *  description. */
  createPaymentEntryForInvoice(credential: UserCredential, invoiceId: string, amount?: number): Promise<any>;

  /** Sends a real reply email against an existing "communication"
   *  (canonical entityKey) thread — see modules/inboxActions/index.ts's
   *  own tool description for the full "why this, not a generic
   *  create_doc" reasoning. attachPrintFormat, when given, attaches a
   *  real generated PDF of the referenced document (e.g. the Quotation
   *  this email thread is about) to the outgoing reply — never a second,
   *  separate document.get_pdf round trip. */
  replyToCommunication(credential: UserCredential, params: { communicationId: string; replyBody: string; attachPrintFormat?: string }): Promise<any>;

  /** Sends a genuinely FRESH outbound email — no existing thread to reply
   *  to (that's replyToCommunication's own job above). See
   *  modules/inboxActions/index.ts's own tool description for the real
   *  "why a dedicated action, not a generic create_doc" reasoning — same
   *  as replyToCommunication, a plain Communication insert() would leave
   *  a record that LOOKS sent but never actually went through SMTP. */
  sendCommunication(credential: UserCredential, params: { recipients: string; subject: string; body: string }): Promise<any>;

  /** Marks one "notification_log" (canonical entityKey) row read, scoped
   *  to the acting user's own notifications only — see
   *  modules/inboxActions/index.ts's own tool description for why this
   *  is a dedicated action rather than a generic update_doc. */
  markNotificationRead(credential: UserCredential, notificationId: string): Promise<any>;
}

// ---- Report config — the ERP-agnostic description of a named report,
// used by core/reportModuleFactory.ts. Same canonical-only discipline
// as EntityConfig: never mentions a specific system's report name.
export interface ReportConfig {
  reportKey: string;              // canonical key, e.g. "stock_balance"
  module: string;
  toolName?: string;              // defaults to "<module>.report.<reportKey>"
  description?: string;
  filterFields?: string[];        // canonical filter names accepted, informational for the LLM
}

// ---- Entity config — the ERP-agnostic description of "a thing you
// can list/get/create/update", used by core/entityModuleFactory.ts.
// Field names here are CANONICAL (e.g. "id", "name", "email") — never
// ERPNext's "name"/"lead_name" or SAP's native field names. Each
// connector's entity map (e.g. erpnext/entityMap.ts) is what resolves
// canonical -> native per provider.
export interface EntityConfig {
  entityKey: string;              // canonical key, e.g. "lead", "sales_order"
  module: string;                 // grouping for the module registry
  toolPrefix: string;
  canonicalFields: string[];      // fields returned by list/get, canonical names
  createFields?: string[];        // canonical fields accepted on create
  operations?: ("list" | "get" | "create" | "update" | "submit")[];
  description?: string;
  // Real, queried-from-the-live-schema values a Select/enum canonical
  // field can actually hold (e.g. status: ["Draft","Open","Closed"]) —
  // surfaced in the generated list tool's filter description
  // (entityModuleFactory.ts) so the LLM matches against real values
  // instead of guessing an English paraphrase of the user's question.
  // Confirmed live 2026-08-09: undocumented status values is exactly
  // why "what % of sales invoices are outstanding" filtered on
  // {"status":"outstanding"} (not a real value) and silently reported
  // 0%. Values here are queried per-doctype from ERPNext's own
  // DocField.options — never hand-guessed — and the empty/blank option
  // ERPNext allows on some Select fields (its own "unset" state) is
  // deliberately omitted, since a real record is never usefully
  // filtered on "no status yet".
  fieldValues?: Record<string, string[]>;
  // Canonical fields that are a Link to another entity's real record id —
  // e.g. leave_allocation's "employee" must be the Employee doctype's own
  // id ("HR-EMP-00031"), never the person's display name ("Ravi Kumar").
  // Confirmed live 2026-08-10: "how many leave days does Ravi Kumar have
  // left" filtered leave_allocation.list on {employee:"Ravi Kumar"} — a
  // silent zero-row match, reported back as "no leave allocation records"
  // (false — the records exist under the real id). Same root-cause shape
  // as fieldValues above (the LLM had no way to know without guessing),
  // just for Link fields instead of Select/enum fields. Value is the
  // linked entityKey (e.g. "employee") so entityModuleFactory.ts can
  // generate a concrete "resolve via <entity>.list first" instruction.
  linkFields?: Record<string, string>;
  // Child-table line items (a Sales Order's Items table, a Quotation's
  // Items table...) — the ONE structural gap every entity had until
  // this was added: every create tool was header-only, so "create a
  // sales order" could never actually carry the items being ordered.
  // canonicalField is the top-level key the LLM sends an array under
  // (usually "items"); itemFields are the canonical keys allowed on
  // each row. Each connector's entity map resolves both the row shape
  // and the native child-table name — same canonical-only discipline
  // as every other field here.
  lineItems?: { canonicalField: string; itemFields: string[]; description?: string };
  // Real, explicit safety gate for an entity where a bare, unfiltered
  // .list call is a genuine problem, not just noise — a person's own
  // email inbox (communication) being the first real case: a "search my
  // email" question with no actual search term given should never dump
  // every message the tenant has ever sent/received into context. When
  // true, entityModuleFactory's generated .list handler returns an empty
  // result instead of running the query at all unless the caller passed
  // at least one real filter — every other entity is unaffected
  // (defaults to false/undefined, the existing behavior).
  requireFilters?: boolean;
  // 2026-08-23, explicit user request: real, config-driven next-step
  // buttons for a single-record READ (.get) result, keyed by the
  // record's own current status value — generalizes CHAIN_NEXT_STEPS
  // (core/reasoningEngine.ts), which only ever covered quotation and
  // opportunity via a hardcoded array, to any entity via its own config.
  // Same server-side, deterministic mechanism (never relies on the
  // model's own prompt compliance) — see appendAutoflowNextSteps's own
  // doc comment for how `display` gets applied.
  //
  // `next` is documentation only (which real doctype(s) this status
  // naturally leads to) — not consumed by any code, purely for a human
  // reading this config to understand the chain at a glance.
  autoflow?: {
    next?: string[];
    display: Record<string, { render: "cards"; next_steps: NextStep[] }>;
  };
}

// ---- Workflow / state machine — THE universal pattern behind "complex
// domain operations" in any business vertical: an approval chain, a
// claims process, an order fulfillment pipeline, a patient admission
// flow, a loan underwriting process. All of these reduce to the same
// shape: an entity has a status field, and moves between named states
// via named actions, subject to who's allowed and whether preconditions
// hold. This is intentionally as domain-blind as EntityConfig — it
// never mentions ERP, healthcare, or banking, because the shape is
// identical across all of them. Only config/workflows.config.ts (per
// deployment) says what the states/actions actually ARE.
export interface WorkflowTransition {
  action: string;                  // canonical action name, e.g. "approve", "reject", "ship"
  from: string[];                  // status values this action is valid from
  to: string;                      // resulting status value
  allowedRoles?: string[];         // extra gate beyond normal tool role policy, optional
  description?: string;
}

export interface WorkflowDefinition {
  key: string;                     // e.g. "lead_qualification", "purchase_approval"
  entityKey: string;               // which canonical entity this workflow governs
  statusField: string;             // canonical field holding current state, e.g. "status"
  transitions: WorkflowTransition[];
  description?: string;
}

// ---- Business rules — THE universal pattern behind "does this action
// conform to normal business practice for this kind of record," as
// distinct from WorkflowTransition (which only governs status changes).
// Same domain-blind discipline as EntityConfig/WorkflowDefinition: a
// rule only ever sees canonical fields and the acting session, never an
// ERP-specific field or doctype name. config/rules/<module>.rules.ts is
// where a real deployment describes what "normal practice" actually
// means for each entity/action; this file only describes the shape.
export interface RuleViolation {
  ruleId: string;
  message: string;
  blocking: boolean;               // true = the action is refused; false = allowed, but flagged
}

export interface BusinessRule {
  id: string;                      // unique within the entity's rule set, e.g. "lead.require_contact_method"
  action: "create" | "update";
  description?: string;
  /** Return a RuleViolation if the rule is broken, or null if it's satisfied.
   *  `current` is the entity's existing state, only present on "update". */
  check(args: Record<string, any>, session: Session, current?: Record<string, any>): Promise<RuleViolation | null> | RuleViolation | null;
  /**
   * The rule's own declared policy for when check() itself fails to run
   * (throws) — separate from what it returns when it DOES run. This only
   * matters for a rule whose check() depends on something that can be
   * unavailable, most commonly a live lookup against connected system
   * data (see businessRuleEngine.ts's own evaluate() doc comment for the
   * real incident this was built for: a relay execution path with no
   * live connection to check against).
   *
   * false/omitted (default): a throw degrades to a non-blocking
   * "could not verify" warning — correct when this rule's own normal
   * blocking:true outcome is rare/advisory-only, or the rule's whole
   * point is a nudge rather than a hard constraint (e.g. every
   * warn_duplicate_* rule today).
   *
   * true: a throw becomes a genuine BLOCKING violation instead — set
   * this on any rule whose refusal is safety-critical enough that
   * silently allowing the action through when the rule couldn't even
   * run would be wrong (e.g. a real credit-limit or stock-availability
   * check that needs live data to decide). No rule in this codebase
   * needs this today — every current blocking rule only reads args/
   * session, never live data, so it can never actually throw — but the
   * flag exists so a future rule that DOES combine "needs live data"
   * with "must block" declares that explicitly, in this rule's own
   * definition, rather than the engine having to guess.
   */
  failClosed?: boolean;
}

export interface RuleSet {
  entityKey: string;                // which canonical entity these rules govern
  rules: BusinessRule[];
}

// ---- Alerts — a proactive, non-conversational notification pushed
// into a signed-in user's chat, originating from outside a prompt/
// response turn (today: an inbound ERPNext webhook — see
// routes/webhooks.routes.ts / core/alertStore.ts). Deliberately not an
// AgentResponse: it never went through the reasoning engine, has no
// tool calls, and is targeted at a specific user rather than being a
// reply to their own message.
export interface Alert {
  id: string;
  entityKey: string;                // canonical entity the alert is about, e.g. "lead"
  recordId: string;                 // canonical id of that record
  message: string;                  // short, human-readable, already rendered
  createdAt: string;
}

// ---- Per-module training curation metadata — gives a concrete home to
// what docs/TRAINING_PLAN.md's governance notes already call for
// ("strip/pseudonymize customer-identifying fields," "retention policy
// per role/module") but never had a per-module file for. Not consumed
// by any runtime path today — it's structured data for the curation/
// export tooling TRAINING_PLAN.md's Phase 2 describes, not logging
// logic (that stays centralized in interaction_log/rule_evaluations
// regardless of module).
export interface ModuleTrainingConfig {
  module: string;
  pseudonymizeFields: string[];      // canonical fields to strip/mask before any fine-tuning export
  retentionDays?: number;            // override for this module's logged rows; omit = no override
  notes?: string;
}

