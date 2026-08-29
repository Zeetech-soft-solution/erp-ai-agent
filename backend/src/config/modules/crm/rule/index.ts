import { LEAD_RULES } from "./lead";
import { CONTACT_RULES } from "./contact";
import { OPPORTUNITY_RULES } from "./opportunity";
import { ADDRESS_RULES } from "./address";
import { RuleSet } from "../../../../core/types";

export const CRM_RULES: RuleSet[] = [
  LEAD_RULES,
  CONTACT_RULES,
  OPPORTUNITY_RULES,
  ADDRESS_RULES,
];
