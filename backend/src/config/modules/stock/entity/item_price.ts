import { EntityConfig } from "../../../../core/types";

export const ITEM_PRICE_ENTITY: EntityConfig = {
    entityKey: "item_price",
    module: "stock",
    toolPrefix: "item_price",
    canonicalFields: ["id", "item", "price_list", "rate", "buying", "selling", "valid_from", "valid_upto"],
    linkFields: { item: "item" },
    createFields: ["item", "price_list", "rate"],
    // Confirmed live 2026-08-11: "what is the selling price of item
    // RM-1000" called item_price.list with limit:1 and reported the
    // selling rate as 0/not set - false, a real Standard Selling rate
    // (420) existed but never got fetched because the single row limit
    // happened to return the OTHER real row (Standard Buying, rate 252)
    // instead. An item routinely has TWO separate rows here (one for
    // its Buying price list, one for Selling) - never assume 1 row is
    // enough when asking about a specific item's price; use the
    // "buying"/"selling" boolean fields to tell them apart, not row
    // order, and don't cap to limit:1 for this entity.
    description: "A price for an item on a given price list, for buying and/or selling. An item commonly has " +
      "TWO separate rows here - one for its buying price list, one for selling - distinguished by the " +
      "\"buying\"/\"selling\" boolean fields, not by which row happens to come back first. Never limit to 1 row " +
      "when asked about a specific item's price; fetch all of that item's rows.",
  };
