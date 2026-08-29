import { BOM_ENTITY } from "./bom";
import { WORK_ORDER_ENTITY } from "./work_order";
import { JOB_CARD_ENTITY } from "./job_card";
import { PRODUCTION_PLAN_ENTITY } from "./production_plan";
import { WORKSTATION_ENTITY } from "./workstation";
import { OPERATION_ENTITY } from "./operation";
import { EntityConfig } from "../../../../core/types";

export const MANUFACTURING_ENTITIES: EntityConfig[] = [
  BOM_ENTITY,
  WORK_ORDER_ENTITY,
  JOB_CARD_ENTITY,
  PRODUCTION_PLAN_ENTITY,
  WORKSTATION_ENTITY,
  OPERATION_ENTITY,
];
