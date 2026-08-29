import { EntityConfig } from "../../../../core/types";

export const ADDRESS_ENTITY: EntityConfig = {
    entityKey: "address",
    module: "crm",
    toolPrefix: "address",
    canonicalFields: ["id", "display_name", "address_type", "address_line1", "city", "country", "pincode"],
    // pincode was in canonicalFields (readable) but missing from
    // createFields (not settable) - a real gap, not intentional: the
    // fieldMap already supports it (entityMaps/crm.ts), erpdatabuild's
    // own address generation always sets one, and there was no doc
    // comment claiming this omission was deliberate, unlike the
    // documented gaps elsewhere in this codebase.
    createFields: ["display_name", "address_type", "address_line1", "city", "country", "pincode"],
    // Confirmed live 2026-08-11: "what's the billing address for Classic
    // Industries & Co" filtered display_name on a FABRICATED compound
    // name ("Suresh Patel-Classic Industries & Co" - the contact's name
    // from an earlier tool call in the same turn, glued onto the company
    // name) instead of the real record ("Classic Industries & Co-
    // Billing"), and reported "no address on file" - false, it exists.
    // ERPNext auto-names Address records as "<party>-<address_type>", a
    // pattern easy to guess wrong; always resolve with a partial "like"
    // match on the real company/party name (e.g. {"display_name":
    // {"op":"like","value":"%Classic Industries%"}}) rather than
    // constructing a guessed exact name from unrelated fields.
    description: "Postal address for customer/supplier/lead. display_name auto-generated. Use like match.",
  };
