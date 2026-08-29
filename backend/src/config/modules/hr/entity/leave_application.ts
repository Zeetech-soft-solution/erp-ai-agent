import { EntityConfig } from "../../../../core/types";

export const LEAVE_APPLICATION_ENTITY: EntityConfig = {
    entityKey: "leave_application",
    module: "hr",
    toolPrefix: "leave_application",
    canonicalFields: ["id", "employee", "leave_type", "department", "from_date", "to_date", "total_leave_days", "status"],
    fieldValues: { status: ["Open", "Approved", "Rejected", "Cancelled"] },
    linkFields: { employee: "employee" },
    createFields: ["employee", "leave_type", "from_date", "to_date"],
    // Doctype-level reinforcement of the same rule already in
    // MODULE_PROMPT_SECTIONS.hr (systemPromptSections.ts) — added
    // 2026-08-19 after a live regression sweep found the module-level
    // rule alone wasn't always enough. NEVER for "who is on leave right
    // now" — confirmed live to silently return the wrong/incomplete
    // answer for that question (see that rule's own doc comment for the
    // full incident).
    description:
      "A leave REQUEST and its approval status (Open/Approved/Rejected/Cancelled) — NOT the " +
      "tool for \"who is on leave [period]\" (use attendance.list for that; an Approved request " +
      "here doesn't mean the date range you're asking about is when it was actually taken, and " +
      "\"Open\" means still awaiting approval, not currently on leave). Use this for the request/" +
      "approval workflow itself — submitting, approving, or checking one specific employee's " +
      "pending/rejected requests.",
  };
