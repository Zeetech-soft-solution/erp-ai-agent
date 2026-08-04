import { EntityConfig } from "../../../core/types";

/** CRM module. "lead" itself is hand-written in src/modules/crm/ (not
 *  this config/modules/crm/ folder — has real business logic beyond
 *  CRUD). Free tier: no generic entity-factory CRM entities beyond
 *  lead — customer/opportunity/contact/address/territory and the rest
 *  of the extensible CRM surface are pro-tier. This file stays here,
 *  empty, so the module's folder shape (entities.ts, rules.ts,
 *  training.ts) is complete and consistent. */
export const CRM_ENTITIES: EntityConfig[] = [];
