import { RolePolicyProvider } from "../core/types";

/**
 * Static, file-based policy — swap this for a DatabaseRolePolicyProvider
 * later (reading from an ERPNext-managed doctype or your own admin UI)
 * WITHOUT touching gateway.ts or the auth flow, because both only ever
 * depend on the RolePolicyProvider interface, never this file.
 */
const ROLE_TOOL_MAP: Record<string, string[]> = {
  "Sales User": [
    "crm.list_leads",
    "crm.get_lead",
    "crm.create_lead",
    "crm.list_opportunities",
    "context.search",
    "lead_qualification.qualify",
    "lead_qualification.disqualify",
  ],
  "Sales Manager": [
    "crm.list_leads",
    "crm.get_lead",
    "crm.create_lead",
    "crm.update_lead_status",
    "crm.list_customers",
    "crm.list_opportunities",
    "crm.create_opportunity",
    "context.search",
    "context.lookup",
    "tickets.list",
    "tickets.resolve",
    "email.list",
    "email.draft",
    "email.send",
    "project_issue.list",
    "project_issue.comment",
    // Workflow action tools — note "convert" itself also requires
    // allowedRoles at the transition level (see workflows.config.ts),
    // so this grants visibility/callability, the transition rule
    // still enforces who can actually complete it.
    "lead_qualification.qualify",
    "lead_qualification.disqualify",
    "lead_qualification.convert",
    // Selling module (generic entity-factory tools)
    "quotation.list",
    "quotation.get",
    "quotation.create",
    "sales_order.list",
    "sales_order.get",
    "sales_order.create",
    "sales_invoice.list",
    "sales_invoice.get",
  ],
  // Generic entity-factory tools (sales_order.list, item.get, etc.)
  // are granted here explicitly per role as you expand entities.config.ts —
  // the factory only makes a tool CALLABLE, it never grants access.
  "Purchasing User": [
    "purchase_order.list",
    "purchase_order.get",
    "purchase_order.create",
    "purchase_invoice.list",
    "purchase_invoice.get",
    "supplier.list",
    "supplier.get",
    "item.list",
    "warehouse.list",
    "stock.report.stock_balance",
  ],
  "HR Manager": [
    "employee.list",
    "employee.get",
    "leave_application.list",
    "leave_application.get",
    "leave_application.create",
    "attendance.list",
  ],
  "Accounts Manager": [
    "account.list",
    "account.get",
    "journal_entry.list",
    "journal_entry.get",
    "payment_entry.list",
    "payment_entry.get",
    "sales_invoice.list",
    "sales_invoice.get",
    "purchase_invoice.list",
    "purchase_invoice.get",
    "accounting.report.general_ledger",
    "accounting.report.accounts_receivable",
  ],

  "System Manager": ["*"],
};

export class StaticRolePolicyProvider implements RolePolicyProvider {
  resolveAllowedTools(erpnextRoles: string[]): string[] {
    const set = new Set<string>();
    for (const role of erpnextRoles) {
      const tools = ROLE_TOOL_MAP[role];
      if (!tools) continue;
      if (tools.includes("*")) return ["*"];
      tools.forEach((t) => set.add(t));
    }
    return Array.from(set);
  }
}
