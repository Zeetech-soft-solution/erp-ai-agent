import { ITEM_ENTITY } from "./item";
import { WAREHOUSE_ENTITY } from "./warehouse";
import { DELIVERY_NOTE_ENTITY } from "./delivery_note";
import { STOCK_ENTRY_ENTITY } from "./stock_entry";
import { MATERIAL_REQUEST_ENTITY } from "./material_request";
import { STOCK_RECONCILIATION_ENTITY } from "./stock_reconciliation";
import { BATCH_ENTITY } from "./batch";
import { ITEM_PRICE_ENTITY } from "./item_price";
import { BIN_ENTITY } from "./bin";
import { EntityConfig } from "../../../../core/types";

export const STOCK_ENTITIES: EntityConfig[] = [
  ITEM_ENTITY,
  WAREHOUSE_ENTITY,
  DELIVERY_NOTE_ENTITY,
  STOCK_ENTRY_ENTITY,
  MATERIAL_REQUEST_ENTITY,
  STOCK_RECONCILIATION_ENTITY,
  BATCH_ENTITY,
  ITEM_PRICE_ENTITY,
  BIN_ENTITY,
];
