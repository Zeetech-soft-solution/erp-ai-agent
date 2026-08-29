import { moduleRegistry } from "./core/moduleRegistry";
import { appConfig } from "./config/app.config";
import { contextModule } from "./modules/context";
import { ticketsModule } from "./modules/tickets";
import { emailModule } from "./modules/email";
import { projectsModule } from "./modules/projects";
import { documentsModule } from "./modules/documents";
import { analyticsModule } from "./modules/analytics";
import { chartModule } from "./modules/chart";
import { reportsModule } from "./modules/reports";
import { paymentEntryActionsModule } from "./modules/paymentEntry";
import { inboxActionsModule } from "./modules/inboxActions";
import { toolDiscoveryModule } from "./modules/toolDiscovery";
import { schemaModule } from "./modules/schema";
import { dataServerModule } from "./modules/dataServer";
import { buildEntityModules } from "./core/entityModuleFactory";
import { ENTITY_CONFIGS } from "./config/entities.config";
import { buildWorkflowModules } from "./core/workflowToolFactory";
import { workflowEngine } from "./core/workflowEngine";
import { WORKFLOW_CONFIGS } from "./config/workflows.config";
import { buildReportModules } from "./core/reportModuleFactory";
import { REPORT_CONFIGS } from "./config/reports.config";
import { businessRuleEngine } from "./core/businessRuleEngine";
import { RULE_CONFIGS } from "./config/rules.config";
import { vectorContextProvider } from "./providers/context/vectorContextProvider";
import { OpenAIEmbedder } from "./providers/embeddings/openaiEmbedder";
import "./renderers/tableRenderer"; // side-effect: registers renderers
import "./renderers/cardsRenderer"; // side-effect: registers the "cards" renderer
import "./renderers/chartRenderer"; // side-effect: registers the "chart" renderer

/**
 * The ONLY file that knows the full list of possible modules.
 * - Hand-written modules (custom business logic): import + add to
 *   AVAILABLE_MODULES, same as before.
 * - Generic ERP entities (the majority, as you expand coverage):
 *   add ONE entry to config/entities.config.ts — ERP-agnostic, works
 *   unchanged whether SYSTEM_PROVIDER is "erpnext" or "sap".
 */
const AVAILABLE_MODULES: Record<string, any> = {
  context: contextModule,
  tickets: ticketsModule,
  email: emailModule,
  project_issue: projectsModule,
  document: documentsModule,
  analytics: analyticsModule,
  chart: chartModule,
  report_generate: reportsModule,
  payment_entry_actions: paymentEntryActionsModule,
  inbox_actions: inboxActionsModule,
  schema_search: schemaModule,
  data_server: dataServerModule,
};

// Shared with core/policyDocumentStore.ts so admin-uploaded policy
// documents embed into the same vector space prompts are matched
// against. Safe no-op (null) without EMBEDDINGS_API_KEY/LLM_API_KEY —
// same "no-op until configured" discipline as every other DB-backed
// service here.
export const embedder = appConfig.embeddings.apiKey ? new OpenAIEmbedder() : null;

// "entities"/"workflows"/"reports" are deliberately not real entries here —
// they're sentinel values the loop below skips before ever reaching the
// "unknown module" warning, then handled properly by their own dedicated
// `if (activeModules.includes(...))` blocks further down. Confirmed live
// 2026-08-17: every single boot logged "Unknown module 'entities'/
// 'workflows'/'reports' in ACTIVE_MODULES — skipping" even though those
// three ARE fully wired up and working (quotation.list and friends verified
// live) — false-alarm noise that could easily mislead anyone reading the
// boot log into thinking real functionality was missing, the way it very
// nearly did during this session's own regression sweep.
const NON_MODULE_ACTIVATION_FLAGS = new Set(["entities", "workflows", "reports"]);

export function bootstrapModules() {
  if (embedder) vectorContextProvider.setEmbedder(embedder);

  // Tool discovery is always registered; gateway permission filtering still
  // controls which users can call it.
  moduleRegistry.register(toolDiscoveryModule);

  for (const name of appConfig.activeModules) {
    const trimmed = name.trim();
    if (NON_MODULE_ACTIVATION_FLAGS.has(trimmed)) continue;
    const mod = AVAILABLE_MODULES[trimmed];
    if (!mod) {
      console.warn(`[bootstrap] Unknown module "${name}" in ACTIVE_MODULES — skipping`);
      continue;
    }
    moduleRegistry.register(mod);
  }

  if (appConfig.activeModules.includes("entities")) {
    for (const mod of buildEntityModules(ENTITY_CONFIGS)) {
      moduleRegistry.register(mod);
    }
  }

  if (appConfig.activeModules.includes("workflows")) {
    for (const workflow of WORKFLOW_CONFIGS) workflowEngine.register(workflow);
    for (const mod of buildWorkflowModules(WORKFLOW_CONFIGS)) {
      moduleRegistry.register(mod);
    }
  }

  if (appConfig.activeModules.includes("reports")) {
    for (const mod of buildReportModules(REPORT_CONFIGS)) {
      moduleRegistry.register(mod);
    }
  }

  for (const ruleSet of RULE_CONFIGS) businessRuleEngine.register(ruleSet);

  console.log(`[bootstrap] Loaded modules: ${moduleRegistry.getModules().map((m) => m.name).join(", ")}`);
}
