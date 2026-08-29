import { MATERIAL_REQUEST_RULES } from "./material_request";
import { ITEM_PRICE_RULES } from "./item_price";
import { RuleSet } from "../../../../core/types";

export const STOCK_RULES: RuleSet[] = [
  MATERIAL_REQUEST_RULES,
  ITEM_PRICE_RULES,
];
