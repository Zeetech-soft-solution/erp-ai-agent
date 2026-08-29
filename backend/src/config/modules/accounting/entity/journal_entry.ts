import { EntityConfig } from "../../../../core/types";

export const JOURNAL_ENTRY_ENTITY: EntityConfig = {
    entityKey: "journal_entry",
    module: "accounting",
    toolPrefix: "journal_entry",
    canonicalFields: ["id", "date", "total_debit", "total_credit", "status"],
    // Unlike every other entity's "status" (a Select field with text
    // options), this one maps to ERPNext's raw docstatus (see
    // entityMaps/accounting.ts) — a plain integer, not a labeled enum,
    // so it's documented in description rather than fieldValues (which
    // exists for real value-string enums, not "0"/"1"/"2" that would
    // read as meaningless to an LLM without this explanation).
    description: "Manual accounting journal entries. status is ERPNext's raw docstatus, not a labeled field: 0 = Draft, 1 = Submitted, 2 = Cancelled — filter/compare using these numbers, not words like \"Submitted\".",
    operations: ["list", "get"],
  };
