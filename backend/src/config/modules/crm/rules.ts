import { RuleSet } from "../../../core/types";

/** CRM module rules — free tier: quotation.list is the only API this
 *  tier exposes (see config/modules/selling), so lead has no exposed
 *  action left to gate and its rules are empty here, same convention
 *  as entities.ts. Real rule depth (lead and everything else) is a
 *  pro-tier capability. */
export const CRM_RULES: RuleSet[] = [];
