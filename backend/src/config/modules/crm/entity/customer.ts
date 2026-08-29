import { EntityConfig } from "../../../../core/types";

export const CUSTOMER_ENTITY: EntityConfig = {
    entityKey: "customer",
    module: "crm",
    toolPrefix: "customer",
    // 2026-08-23: "credit_limit" was proposed here but dropped — not in
    // entityMaps/crm.ts's real customer.fieldMap (only id/display_name/
    // group/territory/email/phone are mapped), so it would show up in
    // this tool's own schema as if valid, never actually populate in
    // real data, and throw on any attempt to filter by it. No live
    // schema access to confirm a real native field for it right now —
    // dropped rather than guessed, same "confirmed live, never
    // hand-typed" discipline every other field here already follows.
    canonicalFields: ["id", "display_name", "group", "territory", "email", "phone"],
    operations: ["list", "get"],
    description: "Customer master + account. Use before filtering invoices/quotations by name.",
  };
