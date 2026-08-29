import { SUPPLIER_ENTITY } from "./supplier";
import { PURCHASE_ORDER_ENTITY } from "./purchase_order";
import { PURCHASE_RECEIPT_ENTITY } from "./purchase_receipt";
import { PURCHASE_INVOICE_ENTITY } from "./purchase_invoice";
import { REQUEST_FOR_QUOTATION_ENTITY } from "./request_for_quotation";
import { SUPPLIER_QUOTATION_ENTITY } from "./supplier_quotation";
import { LANDED_COST_VOUCHER_ENTITY } from "./landed_cost_voucher";
import { SUBCONTRACTING_ORDER_ENTITY } from "./subcontracting_order";
import { SUBCONTRACTING_RECEIPT_ENTITY } from "./subcontracting_receipt";
import { EntityConfig } from "../../../../core/types";

export const BUYING_ENTITIES: EntityConfig[] = [
  SUPPLIER_ENTITY,
  PURCHASE_ORDER_ENTITY,
  PURCHASE_RECEIPT_ENTITY,
  PURCHASE_INVOICE_ENTITY,
  REQUEST_FOR_QUOTATION_ENTITY,
  SUPPLIER_QUOTATION_ENTITY,
  LANDED_COST_VOUCHER_ENTITY,
  SUBCONTRACTING_ORDER_ENTITY,
  SUBCONTRACTING_RECEIPT_ENTITY,
];
