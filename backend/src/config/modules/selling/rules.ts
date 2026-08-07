import { RuleSet } from "../../../core/types";
import { systemConnector } from "../../system.config";

/**
 * Selling module rules — kept as the one worked example of what a real
 * business rule looks like in this codebase, even though free's only
 * exposed quotation operation is now "list" (see entities.ts) so this
 * particular rule (gated on "create") never actually fires here — it's
 * reference material, not a live check. The extended rule set
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
