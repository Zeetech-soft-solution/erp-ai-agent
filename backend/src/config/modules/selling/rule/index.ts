import { QUOTATION_RULES } from "./quotation";
import { SALES_ORDER_RULES } from "./sales_order";
import { PRICING_RULE_RULES } from "./pricing_rule";
import { RuleSet } from "../../../../core/types";

export const SELLING_RULES: RuleSet[] = [
  QUOTATION_RULES,
  SALES_ORDER_RULES,
  PRICING_RULE_RULES,
];
