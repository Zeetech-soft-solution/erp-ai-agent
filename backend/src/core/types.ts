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
}

// ---- MCP Module (the unit you add to extend the system) ----
export interface MCPModule {
  name: string;                 // e.g. "crm", "tickets", "email", "context"
  description: string;
  tools: ToolDefinition[];
}

// ---- Role policy (who can call what) ----
export interface RolePolicyProvider {
  resolveAllowedTools(erpnextRoles: string[]): Promise<string[]> | string[];
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
}

export interface LLMProvider {
  chat(messages: LLMMessage[], tools: ToolDefinition[]): Promise<LLMResponse>;
}

// ---- Response contract returned to the frontend ----
export type AgentResponseType = "text" | "report" | "document" | "action_result";

export interface DisplayIntent {
  render: "table" | "chart" | "cards" | "timeline" | "raw" | "none";
  highlight?: string[];
  next_steps?: string[];
}

export interface AgentResponse {
  type: AgentResponseType;
  message: string;
  data?: any;
  html?: string;                 // server-rendered, sanitized — "report" only
  document?: { name: string; url?: string; content?: string };
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

  list(entityKey: string, credential: UserCredential, params?: { filters?: Record<string, any>; limit?: number; offset?: number }): Promise<any[]>;
  get(entityKey: string, credential: UserCredential, id: string): Promise<any>;
  create(entityKey: string, credential: UserCredential, canonicalData: Record<string, any>): Promise<any>;
  update(entityKey: string, credential: UserCredential, id: string, canonicalData: Record<string, any>): Promise<any>;

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
  operations?: ("list" | "get" | "create" | "update")[];
  description?: string;
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

