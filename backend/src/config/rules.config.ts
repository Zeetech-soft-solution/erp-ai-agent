import { RuleSet } from "../core/types";
import { CRM_RULES } from "./modules/crm/rule";
import { SELLING_RULES } from "./modules/selling/rule";
import { BUYING_RULES } from "./modules/buying/rule";
import { STOCK_RULES } from "./modules/stock/rule";
import { ACCOUNTING_RULES } from "./modules/accounting/rule";
import { HR_RULES } from "./modules/hr/rule";
import { MANUFACTURING_RULES } from "./modules/manufacturing/rule";
import { PROJECTS_RULES } from "./modules/projects/rule";
import { ASSETS_RULES } from "./modules/assets/rule";
import { QUALITY_RULES } from "./modules/quality/rule";
import { SUPPORT_RULES } from "./modules/support/rule";

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
