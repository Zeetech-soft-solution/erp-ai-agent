import { RuleSet } from "../../../core/types";
import { systemConnector } from "../../system.config";

/**
 * CRM module rules — free tier: only the two rules covering lead
 * creation (the only lead action this tier exposes — see
 * src/modules/crm/index.ts, which has no update tool). The extended
 * rule set (status-change gating, and every other module's business
 * rules) is a pro-tier capability.
 */
export const CRM_RULES: RuleSet[] = [
  {
    entityKey: "lead",
    rules: [
      {
        id: "lead.require_contact_method",
        action: "create",
        description: "A lead needs at least one way to be contacted",
        check: (args) => {
          if (!args?.email && !args?.phone) {
            return {
              ruleId: "lead.require_contact_method",
              message: "A lead needs at least an email or a phone number.",
              blocking: true,
            };
          }
          return null;
        },
      },
      {
        id: "lead.warn_duplicate_email",
        action: "create",
        description: "Flag (don't block) creating a lead whose email already exists",
        check: async (args, session) => {
          if (!args?.email) return null;
          const existing = await systemConnector.list("lead", session.credential, { filters: { email: args.email }, limit: 1 });
          if (existing.length > 0) {
            return {
              ruleId: "lead.warn_duplicate_email",
              message: `A lead with email "${args.email}" already exists (${existing[0].display_name || existing[0].id}).`,
              blocking: false,
            };
          }
          return null;
        },
      },
    ],
  },
];
