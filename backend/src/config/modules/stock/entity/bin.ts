import { EntityConfig } from "../../../../core/types";

export const BIN_ENTITY: EntityConfig = {
    entityKey: "bin",
    module: "stock",
    toolPrefix: "bin",
    // System-maintained stock-position cache (item x warehouse) — never
    // created/updated directly, only ever read.
    canonicalFields: ["id", "item", "warehouse", "actual_qty", "reserved_qty", "ordered_qty", "projected_qty", "valuation_rate"],
    linkFields: { item: "item", warehouse: "warehouse" },
    operations: ["list", "get"],
    description: "Current stock position (quantity, reservations, valuation) for an item at a warehouse — actual_qty is the real quantity physically on hand right now. THIS is the tool for any \"how much X do we have\"/\"stock level\"/\"low stock\"/\"out of stock\" question, never item.list (which has no quantity field at all).",
  };
