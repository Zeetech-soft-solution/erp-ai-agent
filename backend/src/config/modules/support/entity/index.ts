import { ISSUE_ENTITY } from "./issue";
import { COMMUNICATION_ENTITY } from "./communication";
import { NOTIFICATION_LOG_ENTITY } from "./notification_log";
import { EntityConfig } from "../../../../core/types";

export const SUPPORT_ENTITIES: EntityConfig[] = [
  ISSUE_ENTITY,
  COMMUNICATION_ENTITY,
  NOTIFICATION_LOG_ENTITY,
];
