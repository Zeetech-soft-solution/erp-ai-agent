import { EntityConfig } from "../../../../core/types";

export const ATTENDANCE_ENTITY: EntityConfig = {
    entityKey: "attendance",
    module: "hr",
    toolPrefix: "attendance",
    canonicalFields: ["id", "employee", "department", "date", "status"],
    fieldValues: { status: ["Present", "Absent", "On Leave", "Half Day", "Work From Home"] },
    linkFields: { employee: "employee" },
    operations: ["list", "get"],
    // 2026-08-23: description cut — this was doctype-level reinforcement
    // added 2026-08-19 specifically because the module-level HR rule
    // alone once wasn't enough (a live regression used leave_application/
    // leave_allocation instead of this entity for "who's on leave").
    description: "Daily attendance. Use for 'who is on leave/absent/present'. Filter by status + date.",
  };
