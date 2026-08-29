import "dotenv/config";
import { types as pgTypes } from "pg";

// node-postgres returns BIGINT (OID 20) as a JS string to avoid precision
// loss past Number.MAX_SAFE_INTEGER. Token counts in this app never
// approach 2^53, so parse every bigint as a real number once, globally —
// otherwise `a + b` on two bigint columns is string concatenation.
pgTypes.setTypeParser(20, (val: string) => parseInt(val, 10));

/**
 * Central switchboard. Enabling/disabling a module or swapping a provider
 * is an env var change, not a code change — bootstrap.ts reads this file
 * to decide what to wire up.
 *
 * Free tier: single-tenant, self-hosted, direct connection to the ERP.
 * No relay, no multi-tenant billing, no platform-admin console — those
 * live only in the paid SaaS build.
 */
export const appConfig = {
  port: Number(process.env.PORT || 4000),

  // Comma-separated module names to load. Add a new module dir under
  // src/modules/, then add its name here (or via env) — nothing else
  // needs to change. "entities"/"workflows"/"reports" are activation
  // flags for the generic factories, not real module dirs.
  activeModules: (
    process.env.ACTIVE_MODULES ||
    "context,tickets,email,project_issue,document,analytics,chart,report_generate,payment_entry_actions,inbox_actions,schema_search,data_server,entities,workflows,reports"
  ).split(","),

  // Roles allowed into the admin interface — separate trust boundary from
  // allowed_tools (agent tool permissions). Not tool-gated because
  // settings CRUD is never something the LLM itself calls.
  adminRoles: (process.env.ADMIN_ROLES || "System Manager").split(","),

  // Persistent, multi-thread chat history (core/conversationStore.ts,
  // db/migrations/013_conversations.sql). Flip to "true" (no redeploy
  // needed) to surface the history sidebar in the agent app.
  chatHistoryEnabled: process.env.CHAT_HISTORY_ENABLED === "true",

  security: {
    // 32-byte, base64-encoded key for encrypting stored user credentials
    // at rest (core/credentialVault.ts). Generate with:
    //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY || "",
  },

  // Which SystemConnector implementation config/system.config.ts
  // instantiates. "erpnext" today; any other business backend tomorrow —
  // this is a business-system switch, not an "ERP" switch.
  system: {
    provider: process.env.SYSTEM_PROVIDER || "erpnext",
  },

  erpnext: {
    baseUrl: process.env.ERPNEXT_BASE_URL || "",
    apiKey: process.env.ERPNEXT_API_KEY || "",
    apiSecret: process.env.ERPNEXT_API_SECRET || "",
    // Verifies the X-Frappe-Webhook-Signature header on inbound
    // /api/webhooks/erpnext/:doctype calls (see routes/webhooks.routes.ts)
    // — must match the "Webhook Secret" set on the ERPNext Webhook record.
    webhookSecret: process.env.ERPNEXT_WEBHOOK_SECRET || "",
  },

  jwt: {
    secret: process.env.AGENT_JWT_SECRET || "dev-secret-change-me",
    expiresIn: process.env.AGENT_JWT_EXPIRES_IN || "8h",
  },

  llm: {
    provider: process.env.LLM_PROVIDER || "openai", // swap key -> swap provider in bootstrap.ts
    apiKey: process.env.LLM_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    maxToolIterations: Number(process.env.LLM_MAX_TOOL_ITERATIONS || 8),
    maxTokensPerMinute: Number(process.env.LLM_MAX_TOKENS_PER_MINUTE || 200_000),
  },

  context: {
    sessionCacheTurns: Number(process.env.CONTEXT_SESSION_TURNS || 6),
    vectorTopK: Number(process.env.CONTEXT_VECTOR_TOPK || 5),
    totalBudgetChars: Number(process.env.CONTEXT_BUDGET_CHARS || 6000),
  },

  // Embeds prompts (vectorContextProvider) and admin-uploaded policy
  // documents (policyDocumentStore) into the same pgvector space.
  // Defaults to reusing the LLM key. Safe no-op (see bootstrap.ts)
  // without an API key.
  embeddings: {
    apiKey: process.env.EMBEDDINGS_API_KEY || process.env.LLM_API_KEY || "",
    baseUrl: process.env.EMBEDDINGS_BASE_URL || "https://api.openai.com/v1",
    model: process.env.EMBEDDINGS_MODEL || "text-embedding-3-small",
  },

  db: {
    postgresUrl: process.env.DATABASE_URL || "",
  },

  // Same "empty string = not configured, callers fall back safely"
  // convention as db.postgresUrl. Optional for a single-instance
  // self-hosted deploy; used only to share session/cache state if you
  // ever run more than one backend process.
  redis: {
    url: process.env.REDIS_URL || "",
  },

  // CORS allow-list. Auth is a bearer token in localStorage (never a
  // cookie), so a cross-origin page has no ambient credential to ride
  // along; this is defense in depth. Comma-separated env override.
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:5174")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
};
