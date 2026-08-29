import { MCPModule } from "../../core/types";
import { systemConnector } from "../../config/system.config";

/**
 * Hand-written module for recording a real payment against a Sales
 * Invoice. NOT built via entityModuleFactory's generic createFields
 * pattern like most *.create tools — see systemConnector.
 * createPaymentEntryForInvoice's own doc comment for why: which account
 * actually receives the money, the currency, and the exact allocation
 * against the invoice are real accounting logic this system already
 * computes correctly server-side, and reconstructing that by hand from
 * flat fields would risk a wrong receiving account on a real financial
 * record. This module is just the thin tool-calling wrapper around that
 * connector method — same "never act as the agent's own service
 * account, only ever the logged-in person" discipline as every other
 * module here (session.credential, always).
 *
 * Registered under its own module name ("payment_entry_actions") to
 * avoid colliding with the generic entityModuleFactory-built "payment_entry"
 * module (list/get, see config/modules/accounting/entities.ts) — tool
 * names are the only thing that has to be globally unique
 * (moduleRegistry.findTool), not module names, so the tool itself is
 * still named "payment_entry.create" for a consistent <entity>.<op>
 * naming convention across the whole app.
 */
export const paymentEntryActionsModule: MCPModule = {
  name: "payment_entry_actions",
  description: "Record payment against Sales Invoice.",
  tools: [
    {
      name: "payment_entry.create",
      description: `Record & submit payment against Sales Invoice. invoiceId + amount (omit = pay in full). Confirm details first.`,
      module: "payment_entry_actions",
      entityKey: "payment_entry",
      ruleAction: "create",
      parameters: {
        type: "object",
        properties: {
          invoiceId: { type: "string" },
          amount: { type: "number" },
        },
        required: ["invoiceId"],
      },
      handler: (args, session) => systemConnector.createPaymentEntryForInvoice(session.credential, args.invoiceId, args.amount),
    },
  ],
};
