import { EntityConfig } from "../../../../core/types";

export const PRICING_RULE_ENTITY: EntityConfig = {
    entityKey: "pricing_rule",
    module: "selling",
    toolPrefix: "pricing_rule",
    canonicalFields: ["id", "display_name", "apply_on", "applicable_for", "discount_percentage", "discount_amount", "min_amt", "valid_from", "valid_upto", "disable"],
    // Was list/get only - confirmed live 2026-08-08 against erpdatabuild's
    // Sunrise Electronics dataset that Pricing Rule is now a real,
    // actively-used feature there (Bulk Order Discount, Commercial
    // Customer Discount), so this agent should be able to create/adjust
    // one too, not just read it. apply_on has no doctype default
    // (confirmed against live schema) - without an explicit value
    // ERPNext defaults it to "Item Code", which is wrong for the
    // "whole order total" discounts erpdatabuild actually uses
    // (apply_on="Transaction"), so it's required on create below.
    createFields: ["apply_on", "applicable_for", "discount_percentage", "discount_amount", "valid_from", "valid_upto"],
    description: "A discount/pricing rule automatically applied to matching sales or purchase transactions",
  };
