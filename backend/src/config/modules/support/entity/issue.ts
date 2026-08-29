import { EntityConfig } from "../../../../core/types";

export const ISSUE_ENTITY: EntityConfig = {
    entityKey: "issue",
    module: "support",
    toolPrefix: "issue",
    // priority/status are both Link/Select fields on the real doctype
    // (confirmed against live schema), not free text - status's real
    // options are Open/Replied/On Hold/Resolved/Closed; priority is a
    // Link to Issue Priority, whose real values in this deployment are
    // Low/Medium/High.
    canonicalFields: ["id", "subject", "customer", "customer_name", "contact", "raised_by", "status", "priority", "opening_date", "description"],
    // Was documented in prose above only — now structured too (see
    // core/types.ts's EntityConfig.fieldValues), so the LLM sees it
    // directly in the generated tool description, not just this comment.
    fieldValues: { status: ["Open", "Replied", "On Hold", "Resolved", "Closed"], priority: ["Low", "Medium", "High"] },
    linkFields: { customer: "customer", contact: "contact" },
    createFields: ["subject", "customer", "priority", "description"],
    description: "A customer support ticket",
  };
