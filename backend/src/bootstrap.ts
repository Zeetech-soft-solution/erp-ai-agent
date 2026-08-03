import { moduleRegistry } from "./core/moduleRegistry";
import { appConfig } from "./config/app.config";
import { crmModule } from "./modules/crm";
import { contextModule } from "./modules/context";
import { ticketsModule } from "./modules/tickets";
import { emailModule } from "./modules/email";
import { projectsModule } from "./modules/projects";
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

/**
 * The ONLY file that knows the full list of possible modules.
 * - Hand-written modules (custom business logic): import + add to
 *   AVAILABLE_MODULES, same as before.
 * - Generic ERP entities (the majority, as you expand coverage):
 *   add ONE entry to config/entities.config.ts — ERP-agnostic, works
 *   unchanged whether SYSTEM_PROVIDER is "erpnext" or "sap".
 */
const AVAILABLE_MODULES: Record<string, any> = {
  crm: crmModule,
  context: contextModule,
  tickets: ticketsModule,
  email: emailModule,
  project_issue: projectsModule,
};

// Shared with core/policyDocumentStore.ts so admin-uploaded policy
// documents embed into the same vector space prompts are matched
// against. Safe no-op (null) without EMBEDDINGS_API_KEY/LLM_API_KEY —
// same "no-op until configured" discipline as every other DB-backed
// service here.
export const embedder = appConfig.embeddings.apiKey ? new OpenAIEmbedder() : null;

export function bootstrapModules() {
  if (embedder) vectorContextProvider.setEmbedder(embedder);

  for (const name of appConfig.activeModules) {
    const mod = AVAILABLE_MODULES[name.trim()];
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
