import { CUSTOMER_ENTITY } from "./customer";
import { OPPORTUNITY_ENTITY } from "./opportunity";
import { CONTACT_ENTITY } from "./contact";
import { ADDRESS_ENTITY } from "./address";
import { TERRITORY_ENTITY } from "./territory";
import { LEAD_ENTITY } from "./lead";
import { EntityConfig } from "../../../../core/types";

export const CRM_ENTITIES: EntityConfig[] = [
  CUSTOMER_ENTITY,
  OPPORTUNITY_ENTITY,
  CONTACT_ENTITY,
  ADDRESS_ENTITY,
  TERRITORY_ENTITY,
  LEAD_ENTITY,
];
