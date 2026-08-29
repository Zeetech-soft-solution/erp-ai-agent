import { EntityConfig } from "../../../../core/types";

export const EMPLOYEE_ENTITY: EntityConfig = {
    entityKey: "employee",
    module: "hr",
    toolPrefix: "employee",
    // email/phone added 2026-08-10 — see entityMaps/hr.ts and
    // erpnextConnector.ts's backfillEmployeePhone() for why these need a
    // linked-User lookup rather than a plain field read. Both are only
    // ever populated by employee.get (single-record), never
    // employee.list — same cost/reasoning as customer/supplier's
    // primary-contact backfill.
    canonicalFields: ["id", "display_name", "department", "designation", "status", "email", "phone"],
    fieldValues: { status: ["Active", "Inactive", "Suspended", "Left"] },
    operations: ["list", "get"],
    description: "Employee records. \"email\"/\"phone\" (real contact details) are only populated by " +
      "employee.get on one specific id, never employee.list — call .get() per person when contact info is needed.",
  };
