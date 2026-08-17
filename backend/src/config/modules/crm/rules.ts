import { RuleSet } from "../../../core/types";
import { systemConnector } from "../../system.config";

/**
 * CRM module rules — real business-rule coverage for the CRM sample
 * this module exposes, proving the pattern against ERPNext's Lead/
 * Contact/Opportunity entities exactly the way it runs elsewhere. To
 * extend, add rules to this file's array, or add a new module/rules.ts
 * following the same shape.
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
      {
        id: "lead.convert_requires_manager",
        action: "update",
        description: "Only a Sales Manager or System Manager can mark a lead Converted directly",
        check: (args, session) => {
          if (args?.status !== "Converted") return null;
          const allowedRoles = ["Sales Manager", "System Manager"];
          if (!allowedRoles.some((r) => session.erpnext_roles.includes(r))) {
            return {
              ruleId: "lead.convert_requires_manager",
              message: `Converting a lead directly requires one of: ${allowedRoles.join(", ")}.`,
              blocking: true,
            };
          }
          return null;
        },
      },
    ],
  },
  {
    entityKey: "contact",
    rules: [
      {
        id: "contact.require_contact_method",
        action: "create",
        description: "A contact needs at least one way to be reached",
        check: (args) => {
          if (!args?.email && !args?.phone) {
            return {
              ruleId: "contact.require_contact_method",
              message: "A contact needs at least an email or a phone number.",
              blocking: true,
            };
          }
          return null;
        },
      },
      {
        id: "contact.phone_format",
        action: "create",
        // Deliberately lenient/international, not India-only: digits
        // plus common separators (+, space, dash), 7-15 digits total —
        // E.164's own real-world length bounds — not a rigid
        // country-specific pattern like erpdatabuild's own "+91-XXXXXXXXXX"
        // generation, since a real contact list isn't guaranteed
        // India-only just because this dataset is.
        description: "A contact's phone number must look like a real phone number",
        check: (args) => {
          if (!args?.phone) return null;
          const digits = String(args.phone).replace(/[^0-9]/g, "");
          if (!/^[0-9+\-() ]+$/.test(args.phone) || digits.length < 7 || digits.length > 15) {
            return {
              ruleId: "contact.phone_format",
              message: `"${args.phone}" doesn't look like a valid phone number.`,
              blocking: true,
            };
          }
          return null;
        },
      },
      {
        id: "contact.email_format",
        action: "create",
        description: "A contact's email must look like a real email address",
        check: (args) => {
          if (!args?.email) return null;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
            return {
              ruleId: "contact.email_format",
              message: `"${args.email}" doesn't look like a valid email address.`,
              blocking: true,
            };
          }
          return null;
        },
      },
    ],
  },
  {
    entityKey: "opportunity",
    rules: [
      {
        id: "opportunity.warn_duplicate_open",
        action: "create",
        description: "Flag (don't block) creating an opportunity for a party that already has one open",
        check: async (args, session) => {
          if (!args?.party) return null;
          const existing = await systemConnector.list("opportunity", session.credential, {
            filters: { party: args.party },
            limit: 5,
          });
          const open = existing.filter((o) => o.status && !["Converted", "Lost", "Closed"].includes(o.status));
          if (open.length > 0) {
            return {
              ruleId: "opportunity.warn_duplicate_open",
              message: `"${args.party}" already has an open opportunity (${open[0].id}).`,
              blocking: false,
            };
          }
          return null;
        },
      },
    ],
  },
];
