import { EntityConfig } from "../../../../core/types";

export const LEAVE_ALLOCATION_ENTITY: EntityConfig = {
    entityKey: "leave_allocation",
    module: "hr",
    toolPrefix: "leave_allocation",
    // total_leaves_allocated is schema-required but system-computed (from
    // new_leaves_allocated + any carried-forward balance) — confirmed
    // against the live instance: passing total_leaves_allocated directly
    // on create is silently ignored and ERPNext rejects the document as
    // "Total leaves allocated is mandatory". new_leaves_allocated is the
    // actual input field.
    canonicalFields: ["id", "employee", "leave_type", "from_date", "to_date", "new_leaves_allocated", "total_leaves_allocated"],
    linkFields: { employee: "employee" },
    createFields: ["employee", "leave_type", "from_date", "to_date", "new_leaves_allocated"],
    // Doctype-level reinforcement of the same rule already in
    // MODULE_PROMPT_SECTIONS.hr (systemPromptSections.ts) — added
    // 2026-08-19 after a live regression sweep found the module-level
    // rule alone wasn't always enough. NEVER for "who is on leave right
    // now" — confirmed live to come back empty/misleading for that
    // question (see that rule's own doc comment for the full incident).
    description:
      "The annual leave BALANCE granted to an employee — NOT the tool for \"who is on leave " +
      "[period]\" (use attendance.list for that; an allocation is a per-employee yearly grant, " +
      "not scoped to any date range of actually being on leave, so filtering this by a date range " +
      "returns empty even when people genuinely are on leave that period). Use this only for a " +
      "specific employee's remaining leave balance, scoped to employee(s) already identified.",
  };
