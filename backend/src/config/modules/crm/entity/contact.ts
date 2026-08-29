import { EntityConfig } from "../../../../core/types";

export const CONTACT_ENTITY: EntityConfig = {
    entityKey: "contact",
    module: "crm",
    toolPrefix: "contact",
    // "mobile" (native mobile_no) is readable but deliberately not in
    // createFields - erpdatabuild only ever populates "phone", never
    // mobile_no, so there's no real create-time use for it yet; kept
    // fetchable in case a future contact genuinely has one.
    canonicalFields: ["id", "display_name", "email", "phone", "mobile", "company_name"],
    // Real, live-found gap (2026-08-24, interaction_log 3103): this field
    // is the REAL join key back to Customer (confirmed live, interaction
    // 3095 succeeded joining sales_invoice.customer = contact.company_name)
    // but with no linkFields entry, the auto-generated schema text just
    // listed it as a bare field — no hint it was a join key at all. The
    // model guessed a nonexistent "customer" field instead, twice, even
    // AFTER calling search_schema on this exact table (schema-checking
    // alone can't help when the schema itself doesn't say which field is
    // the real key). See toSchemaText (modules/schema/index.ts) for how
    // this renders into the real "links to customer's own id" hint text.
    linkFields: { company_name: "customer" },
    createFields: ["display_name", "email", "phone"],
    // 2026-08-23: description cut — dropped real fact was "first_name
    // maps to display_name on create" (a canonical-field-naming hint,
    // same class as account's type/root_type or lead's created/
    // created_date, both flagged the same way when cut tonight).
    description: "Contact person for customer/supplier/lead.",
  };
