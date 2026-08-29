import { RolePolicyProvider } from "../core/types";

/**
 * Static, file-based policy — swap this for a DatabaseRolePolicyProvider
 * later (reading from an ERPNext-managed doctype or your own admin UI)
 * WITHOUT touching gateway.ts or the auth flow, because both only ever
 * depend on the RolePolicyProvider interface, never this file.
 *
 * Role names here MUST match the actual ERPNext role names a user is
 * assigned (see this deployment's demo data department -> role table) —
 * a mismatch silently grants nothing for that role, same failure mode as
 * a bad entityMap field name. Fixed one such mismatch while wiring up
 * this pass: the old map used "Purchasing User", but ERPNext's real role
 * is "Purchase User".
 *
 * Every entity here has a matching entityKey in config/entities.config.ts
 * (see that file's module folders for the full canonical field list) —
 * this file only decides WHO gets to call each generated tool, never
 * what the tool does. A tool being registered by entityModuleFactory
 * never implies access; it must also be granted here.
 */
const ROLE_TOOL_MAP: Record<string, string[]> = {
  // Base role every employee has — self-service basics only.
  Employee: [
    "employee.get",
    "leave_application.list",
    "leave_application.get",
    "leave_application.create",
    "attendance.list",
    "attendance.get",
    // ERPNext's own DocPerm for Employee Advance grants create only to
    // "Employee" (self-request) and "Expense Approver", never to HR
    // Manager (confirmed against the live instance) — this is the real
    // self-service request path, not an HR-initiated one.
    "employee_advance.list",
    "employee_advance.get",
    "employee_advance.create",
    // Same self-request shape as employee_advance above - ERPNext's own
    // DocPerm grants Employee create (not just HR staff) here too.
    "expense_claim.list",
    "expense_claim.get",
    "expense_claim.create",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],

  // ---- Sales & Marketing (selling + crm) ----
  "Sales User": [
    // 2026-08-23: modules/crm/index.ts (the hand-written crm.* tools)
    // was deleted — real duplication with entityModuleFactory-generated
    // tools. lead.list/.get/.create replace crm.list_leads/get_lead/
    // create_lead here; opportunity.list (granted below) already
    // covered crm.list_opportunities, so no replacement needed for that
    // one.
    "lead.list",
    "lead.get",
    "lead.create",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    "lead_qualification.qualify",
    "lead_qualification.disqualify",
    "customer.list",
    "customer.get",
    "opportunity.list",
    "opportunity.get",
    "opportunity.create",
    "contact.list",
    "contact.get",
    "contact.create",
    "address.list",
    "address.get",
    "address.create",
    "territory.list",
    "territory.get",
    "quotation.list",
    "quotation.get",
    "quotation.create",
    "sales_order.list",
    "sales_order.get",
    "sales_order.create",
    "sales_invoice.list",
    "sales_invoice.get",
    "pos_invoice.list",
    "pos_invoice.get",
    "item.list",
    "item.get",
    // Confirmed live 2026-08-14: a "KPI dashboard"/"average deal size"
    // question from a Sales User never called analytics.aggregate — not
    // because of a missing hint, but because Sales User/Manager were the
    // only two functional roles in this entire map (besides System
    // Manager's "*") never granted these tools at all, ever since they
    // were added 2026-08-09 (see Employee's own grant comment above for
    // why this is safe — aggregate/calculate run through the same
    // credential-scoped fetch as .list, never a second data boundary).
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],
  "Sales Manager": [
    // 2026-08-23: same fix as Sales User above — lead.list/.get/.create/
    // .update replace crm.list_leads/get_lead/create_lead/
    // update_lead_status. customer.list/.get and opportunity.list/.get/
    // .create/.update (both granted below) already covered
    // crm.list_customers/list_opportunities/create_opportunity, so no
    // replacement needed for those three.
    "lead.list",
    "lead.get",
    "lead.create",
    "lead.update",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
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
    "customer.list",
    "customer.get",
    "opportunity.list",
    "opportunity.get",
    "opportunity.create",
    "opportunity.update",
    "contact.list",
    "contact.get",
    "contact.create",
    "contact.update",
    "address.list",
    "address.get",
    "address.create",
    "address.update",
    "territory.list",
    "territory.get",
    "quotation.list",
    "quotation.get",
    "quotation.create",
    "quotation.update",
    "sales_order.list",
    "sales_order.get",
    "sales_order.create",
    "sales_order.update",
    "sales_invoice.list",
    "sales_invoice.get",
    "pos_invoice.list",
    "pos_invoice.get",
    "pricing_rule.list",
    "pricing_rule.get",
    "accounting.report.sales_register",
    "item.list",
    "item.get",
    // See the matching comment on "Sales User" above — same gap, same fix.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],

  // ---- Purchase (buying) ----
  "Purchase User": [
    "purchase_order.list",
    "purchase_order.get",
    "purchase_order.create",
    "purchase_receipt.list",
    "purchase_receipt.get",
    "purchase_invoice.list",
    "purchase_invoice.get",
    "rfq.list",
    "rfq.get",
    "supplier_quotation.list",
    "supplier_quotation.get",
    "supplier.list",
    "supplier.get",
    // ERPNext grants Purchase User create on Contact/Address too (they
    // register a supplier's contact person/address) — confirmed against
    // the live instance's DocPerm, not assumed.
    "contact.list",
    "contact.get",
    "contact.create",
    "contact.update",
    "address.list",
    "address.get",
    "address.create",
    "address.update",
    "item.list",
    "item.get",
    "warehouse.list",
    "warehouse.get",
    "material_request.list",
    "material_request.get",
    "material_request.create",
    // Real, live-found gap 2026-08-19 (a fresh 151-prompt regression
    // pass): "list active subcontracting orders" as a real Purchase
    // User got "I don't have access" — checked the live DocPerm, not
    // assumed: ERPNext's own real Subcontracting Order/Receipt DocPerm
    // grants Purchase User read=1 on both, same bug class as the
    // earlier session's "Purchase-User false-denial" incident (a real
    // ERPNext-DocPerm grant this file simply hadn't caught up to yet).
    "subcontracting_order.list",
    "subcontracting_order.get",
    "subcontracting_receipt.list",
    "subcontracting_receipt.get",
    "stock.report.stock_balance",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],
  "Purchase Manager": [
    "purchase_order.list",
    "purchase_order.get",
    "purchase_order.create",
    "purchase_order.update",
    "purchase_receipt.list",
    "purchase_receipt.get",
    "purchase_invoice.list",
    "purchase_invoice.get",
    "rfq.list",
    "rfq.get",
    "supplier_quotation.list",
    "supplier_quotation.get",
    "landed_cost_voucher.list",
    "landed_cost_voucher.get",
    "subcontracting_order.list",
    "subcontracting_order.get",
    "subcontracting_receipt.list",
    "subcontracting_receipt.get",
    "supplier.list",
    "supplier.get",
    "contact.list",
    "contact.get",
    "contact.create",
    "contact.update",
    "address.list",
    "address.get",
    "address.create",
    "address.update",
    "item.list",
    "item.get",
    // item_price.create/update is real ERPNext functionality, but its
    // DocPerm is scoped to "Purchase Master Manager"/"Sales Master
    // Manager" (confirmed against the live instance) — a distinct role
    // from Purchase Manager that this deployment's demo users don't
    // carry. Left list/get only here so it doesn't grant a tool that
    // would always 403 for a real Purchase Manager.
    "item_price.list",
    "item_price.get",
    "warehouse.list",
    "warehouse.get",
    "material_request.list",
    "material_request.get",
    "material_request.create",
    "material_request.update",
    "stock.report.stock_balance",
    "accounting.report.purchase_register",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],

  // ---- Stores & Logistics (stock) ----
  "Stock User": [
    "item.list",
    "item.get",
    "warehouse.list",
    "warehouse.get",
    "delivery_note.list",
    "delivery_note.get",
    "purchase_receipt.list",
    "purchase_receipt.get",
    "stock_entry.list",
    "stock_entry.get",
    "material_request.list",
    "material_request.get",
    "material_request.create",
    "material_request.update",
    "stock_reconciliation.list",
    "stock_reconciliation.get",
    // batch.list/item_price.list are real tools, but their DocPerm is
    // scoped to "Item Manager"/"Purchase Master Manager"/"Sales Master
    // Manager" (confirmed against the live instance), not Stock User —
    // granted anyway since a Stock User legitimately needs batch
    // traceability visibility in principle; today it 403s at the
    // ERPNext layer for this deployment's actual Stock User accounts,
    // which is a demo-data permission gap, not an agent bug (flagged
    // separately rather than silently loosened here).
    "batch.list",
    "batch.get",
    "item_price.list",
    "item_price.get",
    "bin.list",
    "bin.get",
    // Real, live-found gap 2026-08-19 — same class as Purchase User's
    // own subcontracting fix above: ERPNext's real DocPerm grants Stock
    // User read=1 on both Subcontracting Order and Subcontracting
    // Receipt (confirmed against the live instance, not assumed).
    "subcontracting_order.list",
    "subcontracting_order.get",
    "subcontracting_receipt.list",
    "subcontracting_receipt.get",
    "stock.report.stock_balance",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],

  // ---- Production (manufacturing) ----
  "Manufacturing User": [
    "bom.list",
    "bom.get",
    // ERPNext's own DocPerm for Work Order grants create to
    // "Manufacturing User" directly (confirmed against the live
    // instance) — a shop-floor Manufacturing User places work orders
    // day-to-day, this isn't manager-only in ERPNext itself.
    "work_order.list",
    "work_order.get",
    "work_order.create",
    "job_card.list",
    "job_card.get",
    "production_plan.list",
    "production_plan.get",
    "workstation.list",
    "workstation.get",
    "operation.list",
    "operation.get",
    "item.list",
    "item.get",
    // material_request.list/get only: ERPNext's Material Request DocPerm
    // is scoped to Purchase/Stock roles (confirmed against the live
    // instance), not Manufacturing — a Manufacturing User can see
    // outstanding requests but not raise one directly.
    "material_request.list",
    "material_request.get",
    "stock.report.stock_balance",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],
  "Manufacturing Manager": [
    "bom.list",
    "bom.get",
    "work_order.list",
    "work_order.get",
    "work_order.create",
    "work_order.update",
    "job_card.list",
    "job_card.get",
    "production_plan.list",
    "production_plan.get",
    "workstation.list",
    "workstation.get",
    "operation.list",
    "operation.get",
    "item.list",
    "item.get",
    "material_request.list",
    "material_request.get",
    "stock.report.stock_balance",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],

  // ---- Quality Control ----
  "Quality Manager": [
    "quality_inspection.list",
    "quality_inspection.get",
    "quality_inspection.create",
    "quality_inspection.update",
    "quality_goal.list",
    "quality_goal.get",
    "item.list",
    "item.get",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],

  // ---- Research & Development / general project work ----
  "Projects User": [
    "project.list",
    "project.get",
    "project.create",
    "project.update",
    "task.list",
    "task.get",
    "task.create",
    "task.update",
    "timesheet.list",
    "timesheet.get",
    "project_issue.list",
    "project_issue.comment",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],

  // ---- Human Resources ----
  "HR User": [
    "employee.list",
    "employee.get",
    "leave_application.list",
    "leave_application.get",
    "leave_application.create",
    "attendance.list",
    "attendance.get",
    "job_opening.list",
    "job_opening.get",
    "job_opening.create",
    "job_opening.update",
    // leave_allocation, job_applicant, job_offer create/update: ERPNext's
    // own DocPerm grants HR User the same create access as HR Manager on
    // these three doctypes (confirmed against the live instance) — not
    // manager-only.
    "leave_allocation.list",
    "leave_allocation.get",
    "leave_allocation.create",
    "leave_allocation.update",
    "department.list",
    "department.get",
    "designation.list",
    "designation.get",
    "shift_type.list",
    "shift_type.get",
    "shift_assignment.list",
    "shift_assignment.get",
    "shift_assignment.create",
    "interview.list",
    "interview.get",
    "interview.create",
    "job_applicant.list",
    "job_applicant.get",
    "job_applicant.create",
    "job_applicant.update",
    "job_offer.list",
    "job_offer.get",
    "job_offer.create",
    "job_offer.update",
    // ERPNext's own DocPerm for Training Event grants HR User write but
    // not create (confirmed against the live instance) - HR Manager is
    // the one who schedules a new event, HR User can only update one.
    "training_event.list",
    "training_event.get",
    "training_event.update",
    // HR User has full create+update on Expense Claim (confirmed
    // against the live instance) - unlike training_event, no split here.
    "expense_claim.list",
    "expense_claim.get",
    "expense_claim.create",
    "expense_claim.update",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],
  "HR Manager": [
    "employee.list",
    "employee.get",
    "leave_application.list",
    "leave_application.get",
    "leave_application.create",
    "leave_application.update",
    "attendance.list",
    "attendance.get",
    "job_opening.list",
    "job_opening.get",
    "job_opening.create",
    "job_opening.update",
    "leave_allocation.list",
    "leave_allocation.get",
    "leave_allocation.create",
    "leave_allocation.update",
    "department.list",
    "department.get",
    "designation.list",
    "designation.get",
    "shift_type.list",
    "shift_type.get",
    "shift_assignment.list",
    "shift_assignment.get",
    "shift_assignment.create",
    "shift_assignment.update",
    // list/get only: ERPNext's DocPerm for Employee Advance grants create
    // only to "Employee" (self-request) and "Expense Approver" (confirmed
    // against the live instance) — HR Manager has read-only oversight,
    // never create, on this specific doctype.
    "employee_advance.list",
    "employee_advance.get",
    "job_applicant.list",
    "job_applicant.get",
    "job_applicant.create",
    "job_applicant.update",
    "interview.list",
    "interview.get",
    "interview.create",
    "interview.update",
    "job_offer.list",
    "job_offer.get",
    "job_offer.create",
    "job_offer.update",
    "appraisal_cycle.list",
    "appraisal_cycle.get",
    "appraisal.list",
    "appraisal.get",
    "salary_slip.list",
    "salary_slip.get",
    "salary_structure.list",
    "salary_structure.get",
    "salary_structure_assignment.list",
    "salary_structure_assignment.get",
    "payroll_entry.list",
    "payroll_entry.get",
    "training_event.list",
    "training_event.get",
    "training_event.create",
    "training_event.update",
    "expense_claim.list",
    "expense_claim.get",
    "expense_claim.create",
    "expense_claim.update",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],

  // ---- Accounts & Finance ----
  "Accounts User": [
    "account.list",
    "account.get",
    "cost_center.list",
    "cost_center.get",
    "journal_entry.list",
    "journal_entry.get",
    "payment_entry.list",
    "payment_entry.get",
    // New 2026-08-17: real payment recording (modules/paymentEntry) —
    // Accounts is the real-world owner of payment processing (same
    // separation of duties erpdatabuild's own historical simulation
    // already follows — see business_day_engine.py's make_payment_for_invoice,
    // which explicitly runs as "Accounts User" for exactly this reason),
    // not Sales, even though a Sales role can see/confirm the invoice
    // being paid.
    "payment_entry.create",
    "gl_entry.list",
    "gl_entry.get",
    "fiscal_year.list",
    "fiscal_year.get",
    "bank_account.list",
    "bank_account.get",
    "bank_transaction.list",
    "bank_transaction.get",
    "sales_invoice.list",
    "sales_invoice.get",
    "purchase_invoice.list",
    "purchase_invoice.get",
    // ERPNext grants Accounts User/Manager read on Customer too (an
    // invoice is meaningless without being able to look up who it's
    // for) — confirmed against the live instance's DocPerm, not assumed.
    "customer.list",
    "customer.get",
    // ERPNext grants Accounts User/Manager create on Contact/Address too
    // (registering a customer/supplier's billing contact) — confirmed
    // against the live instance's DocPerm, not assumed.
    "contact.list",
    "contact.get",
    "contact.create",
    "contact.update",
    "address.list",
    "address.get",
    "address.create",
    "address.update",
    "accounting.report.accounts_receivable",
    "accounting.report.accounts_payable",
    "accounting.report.trial_balance",
    "accounting.report.purchase_register",
    "accounting.report.sales_register",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],
  "Accounts Manager": [
    "account.list",
    "account.get",
    "cost_center.list",
    "cost_center.get",
    "journal_entry.list",
    "journal_entry.get",
    "payment_entry.list",
    "payment_entry.get",
    // New 2026-08-17: real payment recording (modules/paymentEntry) —
    // Accounts is the real-world owner of payment processing (same
    // separation of duties erpdatabuild's own historical simulation
    // already follows — see business_day_engine.py's make_payment_for_invoice,
    // which explicitly runs as "Accounts User" for exactly this reason),
    // not Sales, even though a Sales role can see/confirm the invoice
    // being paid.
    "payment_entry.create",
    "gl_entry.list",
    "gl_entry.get",
    "fiscal_year.list",
    "fiscal_year.get",
    "bank_account.list",
    "bank_account.get",
    "bank_transaction.list",
    "bank_transaction.get",
    "sales_invoice.list",
    "sales_invoice.get",
    "purchase_invoice.list",
    "purchase_invoice.get",
    "customer.list",
    "customer.get",
    "contact.list",
    "contact.get",
    "contact.create",
    "contact.update",
    "address.list",
    "address.get",
    "address.create",
    "address.update",
    "asset.list",
    "asset.get",
    "asset_category.list",
    "asset_category.get",
    "asset_depreciation_schedule.list",
    "asset_depreciation_schedule.get",
    "asset_maintenance.list",
    "asset_maintenance.get",
    "accounting.report.general_ledger",
    "accounting.report.accounts_receivable",
    "accounting.report.accounts_payable",
    "accounting.report.balance_sheet",
    "accounting.report.profit_and_loss",
    "accounting.report.cash_flow",
    "accounting.report.trial_balance",
    "accounting.report.purchase_register",
    "accounting.report.sales_register",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    // New 2026-08-09: the sum/avg/count/min/max/percentage calculator
    // tools (modules/analytics) - granted everywhere .list already is,
    // since aggregate() runs through the SAME UserCredential-scoped
    // fetch as list() (see erpnextConnector.ts) - a role can never
    // aggregate rows it couldn't already list. This grant only decides
    // whether the feature is visible to that role's chat, not a second
    // data boundary.
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],

  // ---- Customer Support ----
  "Support Team": [
    // ERPNext's own DocPerm for Issue grants create/write/read ONLY to
    // Support Team (confirmed against the live instance) — no separate
    // "Support Manager" split exists in this deployment's role set, so
    // one block covers the whole desk.
    "issue.list",
    "issue.get",
    "issue.create",
    "issue.update",
    "customer.list",
    "customer.get",
    "contact.list",
    "contact.get",
    "context.search",
    "document.get_pdf",
    // report.generate (modules/reports) — granted everywhere document.get_pdf
    // already is: same shape (a downloadable-file tool, never row data back
    // into chat), and the actual fetch still runs through this person's own
    // credential — same permission boundary as list()/runReport(), not a
    // second data boundary of its own.
    "report.generate",
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
    // New 2026-08-15: chart.build (modules/chart) — granted everywhere the
    // rest of the analytics toolkit already is, same reasoning as every
    // grant comment above (it's a pure shaping step over numbers this role
    // could already fetch, never a second data boundary of its own).
    "chart.build",
  ],

  "System Manager": ["*"],
};

// Real, explicit product ask (2026-08-19): "find notification... and
// also the email section" — a personal inbox/notification feed, not
// something scoped by department the way Sales Orders or Payroll are.
// Notification Log's own real permission_query_conditions already
// restrict every list/get to the CALLING user's own for_user rows
// (confirmed against the live controller source), and
// communication.reply's real send still goes through frappe.has_
// permission's own "email" check against whatever document the thread
// is linked to — so granting the TOOL NAME broadly here is safe; the
// real ERPNext data boundary is unchanged and still enforced
// underneath, same "this grant only decides whether the feature is
// visible, never a second data boundary" reasoning as analytics.aggregate
// above. Appended after the literal (rather than repeating six lines in
// all 16 role arrays above) so every future role gets it automatically
// too — "System Manager": ["*"] already covers everything and is
// skipped here on purpose (it would be a meaningless no-op append).
const COMMON_INBOX_TOOLS = ["communication.list", "communication.get", "communication.reply", "notification_log.list", "notification_log.get", "notification_log.mark_read"];
// Same reasoning as COMMON_INBOX_TOOLS above, appended separately so the
// two stay independently readable: tools.search (modules/toolDiscovery)
// is a pure meta-tool — it only ever introspects this SAME real allowed-
// tool list (gateway.ts's listAllowedTools()) and returns a subset of
// it, never a second access boundary — so every real role should have
// it, unconditionally.
const COMMON_META_TOOLS = ["tools.search"];
// Real, explicit product ask (2026-08-20): "everything gap filled" —
// data_table.search_schema (renamed from schema.search the same
// session) is, same as analytics.aggregate/tools.search above, never a
// second real data boundary of its own: data_table.list/search_schema
// are pure static config, no data at all; database_engine.execute_query
// (renamed from data_server.run, itself a real gap — never added here
// at all until this same rename pass; its own "join" mode is now the
// ONLY way to join two entities — see modules/join/index.ts's own doc
// comment, 2026-08-22) runs through the same systemConnector.list/
// aggregate as everything else, same real permission boundary — ERPNext's
// own DocPerm still governs what rows come back exactly as it would for
// that same person's own .list calls. Appended here (not hand-duplicated
// across 16 role arrays, unlike analytics.aggregate's own older pattern
// above) — every future role gets all three automatically too.
// report.generate is NOT repeated here — it already has its own real,
// explicit per-role grant above (predates this shared-append pattern);
// adding it a second time here would be a harmless but confusing
// duplicate.
const COMMON_UTILITY_TOOLS = ["data_table.list", "data_table.search_schema", "database_engine.execute_query"];
for (const role of Object.keys(ROLE_TOOL_MAP)) {
  if (ROLE_TOOL_MAP[role].includes("*")) continue;
  ROLE_TOOL_MAP[role] = [...ROLE_TOOL_MAP[role], ...COMMON_INBOX_TOOLS, ...COMMON_META_TOOLS, ...COMMON_UTILITY_TOOLS];
}

export class StaticRolePolicyProvider implements RolePolicyProvider {
  resolveAllowedTools(roles: string[]): string[] {
    const set = new Set<string>();
    for (const role of roles) {
      const tools = ROLE_TOOL_MAP[role];
      if (!tools) continue;
      if (tools.includes("*")) return ["*"];
      tools.forEach((t) => set.add(t));
    }
    return Array.from(set);
  }
}
