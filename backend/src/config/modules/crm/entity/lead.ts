import { EntityConfig } from "../../../../core/types";

// 2026-08-23, explicit user request: modules/crm/index.ts (the hand-
// written crm.list_leads/get_lead/create_lead/update_lead_status/
// list_customers/list_opportunities/create_opportunity module) was
// deleted entirely — real, confirmed duplication with the generic
// entityModuleFactory-generated tools for customer/opportunity (both
// already had list/get/create/update generated from their own configs
// in this folder), and crm.create_lead/update_lead_status turned out to
// be PLAIN passthroughs (systemConnector.create/update with no extra
// logic at all — confirmed via git history), not the "real workflow
// logic" an earlier version of this comment claimed. So operations
// widened here from ["list","get"] to the full default set — the
// generic lead.create/lead.update entityModuleFactory generates now
// covers exactly what the deleted hand-written tools did, with zero
// real logic lost, PLUS real entityKey/ruleAction business-rule
// tagging "for free" (buildEntityModule's own doc comment) which the
// deleted crm.create_opportunity never had (a real, separate gap that's
// now also closed for lead by construction).
//
// createFields matches the deleted crm.create_lead's own real
// properties (display_name required, email/phone optional) — without
// this, the generic factory would expose every canonicalField
// (including "id"/"status"/"created", none of which should be
// caller-settable at creation) since createFields falls back to
// canonicalFields when omitted.
export const LEAD_ENTITY: EntityConfig = {
  entityKey: "lead",
  module: "crm",
  toolPrefix: "lead",
  canonicalFields: ["id", "display_name", "email", "phone", "status", "source", "owner", "company", "created"],
  fieldValues: { status: ["Lead", "Open", "Replied", "Opportunity", "Quotation", "Lost Quotation", "Interested", "Converted", "Do Not Contact"] },
  createFields: ["display_name", "email", "phone"],
  description: "Sales leads. Filter on created for recency. Filter on status for workflow state.",
};
