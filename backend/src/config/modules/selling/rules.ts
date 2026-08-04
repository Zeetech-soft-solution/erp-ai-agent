import { RuleSet } from "../../../core/types";
import { systemConnector } from "../../system.config";

/**
 * Selling module rules — free tier: only the rule covering quotation
 * creation (the only quotation action this tier exposes — see
 * entities.ts, which has no update operation). The extended rule set
 * (status-change gating, and every other module's business rules) is
 * a pro-tier capability.
 */
export const SELLING_RULES: RuleSet[] = [
  {
    entityKey: "quotation",
    rules: [
      {
        id: "quotation.warn_duplicate_open",
        action: "create",
        description: "Flag (don't block) creating a quotation for a party that already has one open",
        check: async (args, session) => {
          if (!args?.party) return null;
          const existing = await systemConnector.list("quotation", session.credential, {
            filters: { party: args.party },
            limit: 5,
          });
          const open = existing.filter((q) => q.status && !["Ordered", "Lost", "Cancelled", "Expired"].includes(q.status));
          if (open.length > 0) {
            return {
              ruleId: "quotation.warn_duplicate_open",
              message: `"${args.party}" already has an open quotation (${open[0].id}).`,
              blocking: false,
            };
          }
          return null;
        },
      },
    ],
  },
];
