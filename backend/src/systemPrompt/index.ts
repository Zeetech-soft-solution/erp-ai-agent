/**
 * MAIN SYSTEM PROMPT ASSEMBLY.
 *
 * The prompt is action-driven. A thin core is always sent; per-module
 * rules come from a plain keyword match (below); and the heavier
 * per-tool rule blocks (DATA_QUERY_DISCIPLINE, ANALYTICS_RULES,
 * INBOX_RULES, WRITE_OPERATIONS, ...) are declared ON each tool
 * (ToolDefinition.promptRules, set where the tool is defined) and
 * injected into the LIVE system message by relayReasoningEngine.ts the
 * moment that tool's schema is REGISTERED for a turn — before the model
 * ever calls it. NONE of the block TEXT changed — only WHEN each is
 * composed in.
 *
 * ORDER for OpenAI prefix-caching: thin core (always identical) -> write
 * ops -> autoflow -> keyword module sections -> per-session block LAST.
 */
import { relayModulesFor } from "../core/toolRelevanceFilter";
import { AppIdentity } from "./types";

import { SYSTEM_IDENTITY } from "./core/identity";
import { CRITICAL_PRINCIPLES } from "./core/principles";
import { TOOL_DISCOVERY } from "./core/toolDiscovery";
import { DATA_QUERY_DISCIPLINE } from "./core/dataQueryDiscipline";
import { ANALYTICS_RULES } from "./core/analytics";
import { AUTOFLOW_RULES } from "./core/autoFlow";
import { DISPLAY_INSTRUCTIONS } from "./core/display";
import { WRITE_OPERATIONS } from "./core/writeOperations";
import { SCANNED_DOCUMENT_RULES } from "./core/scannedDocuments";
import { INBOX_RULES } from "./core/inbox";

import {
  SELLING_MODULE,
  BUYING_MODULE,
  ACCOUNTING_MODULE,
  HR_MODULE,
  MANUFACTURING_MODULE,
  SUPPORT_MODULE,
  PROJECTS_MODULE,
  STOCK_MODULE,
  ASSETS_MODULE,
  CRM_MODULE,
  QUALITY_MODULE,
  ANALYTICS_MODULE,
} from "./modules";

export * from "./types";

// ============================================
// THIN ALWAYS-ON CORE — every turn, nothing conditional
// ============================================
export const THIN_CORE = [
  SYSTEM_IDENTITY,
  CRITICAL_PRINCIPLES,
  TOOL_DISCOVERY, // the "when to call what" routing map — always
  DISPLAY_INSTRUCTIONS,
].join("\n\n");

// Kept as the FULL join for the no-keyword-match fallback (never strip
// below what works on a genuinely vague turn) and for existing imports.
export const CORE_SYSTEM_PROMPT = [
  SYSTEM_IDENTITY,
  CRITICAL_PRINCIPLES,
  TOOL_DISCOVERY,
  DATA_QUERY_DISCIPLINE,
  AUTOFLOW_RULES,
  DISPLAY_INSTRUCTIONS,
  SCANNED_DOCUMENT_RULES,
  INBOX_RULES,
].join("\n\n");

// ============================================
// MODULE PROMPT SECTIONS — the 11 real ERP domains + "analytics".
// "analytics" stays here so tools.search's guardrails can reuse it, but
// buildSystemPrompt only composes the 11 business domains by keyword
// (analytics rules arrive on the analytics tools' own promptRules when the
// model actually calls an analytics tool).
// ============================================
const BUSINESS_MODULE_KEYS = ["selling", "buying", "accounting", "hr", "manufacturing", "support", "projects", "stock", "assets", "crm", "quality"];

export const MODULE_PROMPT_SECTIONS: Record<string, string[]> = {
  selling: [SELLING_MODULE],
  buying: [BUYING_MODULE],
  accounting: [ACCOUNTING_MODULE],
  hr: [HR_MODULE],
  manufacturing: [MANUFACTURING_MODULE],
  support: [SUPPORT_MODULE],
  projects: [PROJECTS_MODULE],
  stock: [STOCK_MODULE],
  assets: [ASSETS_MODULE],
  crm: [CRM_MODULE],
  quality: [QUALITY_MODULE],
  analytics: [ANALYTICS_RULES, ANALYTICS_MODULE],
};

// ============================================
// USER CONTEXT (dynamic per session, always LAST)
// ============================================
function buildUserContext(identity: AppIdentity, frappeUser: string, frappeRoles: string[]): string {
  return `CURRENT SESSION:
Today: ${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}
Company: ${identity.name}
Logged in as: ${frappeUser}
Role(s): ${frappeRoles.join(", ") || "none"}`;
}

/**
 * Appends `block` to the system message (messages[0]) if it's not
 * already there. Additive only — a rule block never contradicts
 * another, and each is added at most once per conversation. Mutates
 * messages[0] in place, returns whether it changed anything. Used by
 * relayReasoningEngine.ts to inject a tool's rules the first time the
 * model reaches for it.
 */
export function injectPromptBlock(messages: { role: string; content?: any }[], block: string | undefined): boolean {
  if (!block) return false;
  const sys = messages[0];
  if (sys?.role !== "system" || typeof sys.content !== "string" || sys.content.includes(block)) return false;
  sys.content = `${sys.content}\n\n${block}`;
  return true;
}

// ============================================
// MAIN EXPORT
// ============================================
export function buildSystemPrompt(prompt: string, canWrite: boolean, identity: AppIdentity, frappeUser: string, frappeRoles: string[]): string {
  // Same module set the tool selector uses (keyword match + transaction-
  // pair widening), so tools and prompt rules always agree.
  const realModules = [...relayModulesFor(prompt)].filter((m) => BUSINESS_MODULE_KEYS.includes(m));

  const sections: string[] = [];

  // No business-module keyword matched → fall open to the full core (its
  // own TOOL_DISCOVERY block tells the model: unsure → tools.search).
  // Whatever the model then reaches for pulls its own rules in via that
  // tool's promptRules (ToolDefinition), injected at registration time
  // by relayReasoningEngine.ts.
  if (realModules.length === 0) {
    sections.push(CORE_SYSTEM_PROMPT);
  } else {
    sections.push(THIN_CORE, AUTOFLOW_RULES); // AUTOFLOW: any real business-data turn wants the document-chain facts
  }

  // WRITE_OPERATIONS also rides in on every .create/.update/.submit
  // tool's own promptRules — composed here too so a read_write tenant
  // sees "confirm before create" from the very first turn.
  if (canWrite) sections.push(WRITE_OPERATIONS);

  const seen = new Set<string>();
  for (const m of realModules) {
    for (const section of MODULE_PROMPT_SECTIONS[m] || []) {
      if (!seen.has(section)) {
        seen.add(section);
        sections.push(section);
      }
    }
  }

  sections.push(buildUserContext(identity, frappeUser, frappeRoles));
  return sections.join("\n\n");
}
