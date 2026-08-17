import { EntityConfig } from "../../../core/types";

/** CRM module. "lead" itself is hand-written in src/modules/crm/ (not
 *  this config/modules/crm/ folder — has real business logic beyond
 *  CRUD) — these are its generic siblings. */
export const CRM_ENTITIES: EntityConfig[] = [
  {
    entityKey: "customer",
    module: "crm",
    toolPrefix: "customer",
    canonicalFields: ["id", "display_name", "group", "territory", "email", "phone"],
    operations: ["list", "get"],
    description: "Customer accounts",
  },
  {
    entityKey: "opportunity",
    module: "crm",
    toolPrefix: "opportunity",
    canonicalFields: ["id", "party", "status", "amount", "territory", "date"],
    fieldValues: { status: ["Open", "Quotation", "Converted", "Lost", "Replied", "Closed"] },
    createFields: ["party", "amount"],
    description: "Sales opportunities",
  },
  {
    entityKey: "contact",
    module: "crm",
    toolPrefix: "contact",
    // "mobile" (native mobile_no) is readable but deliberately not in
    // createFields - erpdatabuild only ever populates "phone", never
    // mobile_no, so there's no real create-time use for it yet; kept
    // fetchable in case a future contact genuinely has one.
    canonicalFields: ["id", "display_name", "email", "phone", "mobile", "company_name"],
    createFields: ["display_name", "email", "phone"],
    description: "A person to contact at a customer, supplier, or lead — first_name maps to display_name on create",
  },
  {
    entityKey: "territory",
    module: "crm",
    toolPrefix: "territory",
    canonicalFields: ["id", "display_name", "is_group"],
    operations: ["list", "get"],
    description: "Sales territories",
  },
];
