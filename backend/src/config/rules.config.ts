import { RuleSet } from "../core/types";
import { CRM_RULES } from "./modules/crm/rules";
import { SELLING_RULES } from "./modules/selling/rules";
import { BUYING_RULES } from "./modules/buying/rules";
import { STOCK_RULES } from "./modules/stock/rules";
import { ACCOUNTING_RULES } from "./modules/accounting/rules";
import { HR_RULES } from "./modules/hr/rules";
import { MANUFACTURING_RULES } from "./modules/manufacturing/rules";
import { PROJECTS_RULES } from "./modules/projects/rules";
import { ASSETS_RULES } from "./modules/assets/rules";
import { QUALITY_RULES } from "./modules/quality/rules";
import { SUPPORT_RULES } from "./modules/support/rules";

/**
 * ERP-AGNOSTIC business-rule list, assembled from every module's
 * rules.ts (config/modules/<name>/rules.ts), same convention as
 * entities.config.ts. Only crm and selling are populated today — the
 * rest are present as empty stubs so the module-folder shape (entities
 * + rules + training) is complete and consistent everywhere, ready for
 * pro-tier detail. To add real coverage to a module, fill in its
 * rules.ts following crm/rules.ts or selling/rules.ts — nothing here
 * needs to change.
 */
export const RULE_CONFIGS: RuleSet[] = [
  ...CRM_RULES,
  ...SELLING_RULES,
  ...BUYING_RULES,
  ...STOCK_RULES,
  ...ACCOUNTING_RULES,
  ...HR_RULES,
  ...MANUFACTURING_RULES,
  ...PROJECTS_RULES,
  ...ASSETS_RULES,
  ...QUALITY_RULES,
  ...SUPPORT_RULES,
];
