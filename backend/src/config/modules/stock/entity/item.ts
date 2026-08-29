import { EntityConfig } from "../../../../core/types";

export const ITEM_ENTITY: EntityConfig = {
    entityKey: "item",
    module: "stock",
    toolPrefix: "item",
    canonicalFields: ["id", "display_name", "group", "uom", "disabled"],
    // Queried from live ERPNext 2026-08-11 (never guessed — see
    // fieldValues' own doc comment in core/types.ts). Confirmed live:
    // "raw materials stock" had no way to resolve the real category name
    // ("Raw Materials - Electronic", not a guessable "raw_material") —
    // this closes it at the source, and stock_balance's item_group
    // filter (reports.config.ts) uses the same real values.
    fieldValues: { group: ["Electronic Components", "Finished Goods - Electronics", "PCB and Assemblies", "Raw Materials - Electronic", "Services"] },
    operations: ["list", "get"],
    // Real, live-found gap 2026-08-19: "list items with low stock"
    // called item.list (this tool) then admitted it "cannot directly
    // assess stock levels based on the information provided" — true,
    // this is the CATALOG (name/group/UOM), it carries no quantity
    // field at all. The real quantity lives on bin (actual_qty per
    // item+warehouse) — explicit, direct pointer added so a stock-
    // level/"how much do we have"/"low stock" question routes there
    // instead of here.
    description: "The item/product CATALOG (name, group, unit of measure) — no quantity data at all. For actual stock quantities on hand, use bin.list/bin.get instead.",
  };
