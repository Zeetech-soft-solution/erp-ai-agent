import { QUOTATION_ENTITY } from "./quotation";
import { SALES_ORDER_ENTITY } from "./sales_order";
import { SALES_INVOICE_ENTITY } from "./sales_invoice";
import { POS_INVOICE_ENTITY } from "./pos_invoice";
import { PRICING_RULE_ENTITY } from "./pricing_rule";
import { EntityConfig } from "../../../../core/types";

export const SELLING_ENTITIES: EntityConfig[] = [
  QUOTATION_ENTITY,
  SALES_ORDER_ENTITY,
  SALES_INVOICE_ENTITY,
  POS_INVOICE_ENTITY,
  PRICING_RULE_ENTITY,
];
