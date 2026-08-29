import { EntityConfig } from "../../../../core/types";

export const COMMUNICATION_ENTITY: EntityConfig = {
  entityKey: "communication",
  module: "utilities",
  toolPrefix: "communication",
  canonicalFields: ["id", "subject", "sender", "sender_name", "recipients", "body", "date", "direction", "status", "reference_doctype", "reference_name", "read"],
  fieldValues: { status: ["Open", "Replied", "Closed", "Linked"], direction: ["Sent", "Received"] },
  operations: ["list", "get"],
  description: "Real business email inbox. Filter by subject/sender/status/direction/read/date. No filter = empty result.",
  requireFilters: true,
};