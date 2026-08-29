import { EntityConfig } from "../../../../core/types";

export const GL_ENTRY_ENTITY: EntityConfig = {
    entityKey: "gl_entry",
    module: "accounting",
    toolPrefix: "gl_entry",
    // Pure ledger — every row is a system-posted side effect of some
    // other submitted transaction, never created or edited directly.
    canonicalFields: ["id", "date", "account", "party", "voucher_type", "voucher_no", "debit", "credit", "cost_center", "against"],
    // "party" is a Dynamic Link (Customer or Supplier depending on
    // party_type on the row) — deliberately not in linkFields, since
    // mapping it to a single target entity would be a wrong guess half
    // the time; "account"/"cost_center" are always their own doctype.
    linkFields: { account: "account", cost_center: "cost_center" },
    operations: ["list", "get"],
    description: "Posted general ledger entries — the detailed double-entry transaction log behind every account balance",
  };
