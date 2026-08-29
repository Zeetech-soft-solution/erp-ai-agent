import { EntityConfig } from "../../../../core/types";

export const TRAINING_EVENT_ENTITY: EntityConfig = {
    // New 2026-08-09: erpdatabuild's Sunrise Electronics dataset runs
    // real Training Events (Fire Safety Drill, ISO 9001 Refresher,
    // etc.) with attendee lists, so this is a genuine feature, not just
    // an incidentally-populated doctype. create is HR-Manager-only per
    // ERPNext's own DocPerm (confirmed against live schema) - HR User
    // can view/update an existing event but not create one, unlike most
    // of this module's other entities where the two roles match.
    entityKey: "training_event",
    module: "hr",
    toolPrefix: "training_event",
    canonicalFields: ["id", "event_name", "type", "start_time", "end_time"],
    createFields: ["event_name", "type", "start_time", "end_time"],
    description: "An internal training/workshop session, with an attendee list of employees",
  };
