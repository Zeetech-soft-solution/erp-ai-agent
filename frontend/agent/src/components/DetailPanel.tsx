import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Capability { name: string; description: string; }

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM", context: "Context", tickets: "Support", email: "Email",
  customer: "Customers", opportunity: "Opportunities", quotation: "Quotations",
  sales_order: "Sales Orders", sales_invoice: "Sales Invoices", supplier: "Suppliers",
  purchase_order: "Purchase Orders", purchase_invoice: "Purchase Invoices",
  rfq: "Requests for Quote", supplier_quotation: "Supplier Quotations", item: "Items",
  warehouse: "Warehouses", delivery_note: "Delivery Notes", stock_entry: "Stock Entries",
  material_request: "Material Requests", journal_entry: "Journal Entries",
  payment_entry: "Payments", account: "Accounts", cost_center: "Cost Centers",
  employee: "Employees", leave_application: "Leave", attendance: "Attendance",
  salary_slip: "Payroll", job_opening: "Recruitment", bom: "Bills of Materials",
  work_order: "Work Orders", job_card: "Job Cards", production_plan: "Production Planning",
  project: "Projects", task: "Tasks", timesheet: "Timesheets", asset: "Assets",
  asset_maintenance: "Asset Maintenance", quality_inspection: "Quality Inspections",
  quality_goal: "Quality Goals", lead_qualification: "Lead Qualification",
  stock: "Stock Reports", accounting: "Accounting Reports",
};

function moduleKey(toolName: string): string {
  return toolName.split(".")[0];
}
function moduleLabel(key: string): string {
  return MODULE_LABELS[key] || key.split("_").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}
/** Drop the redundant "List X records —" scaffolding entity-factory tools
 * generate and surface plain functionality text, not API-call phrasing. */
function humanizeDescription(desc: string): string {
  return desc
    .replace(/^(List|Get|Create|Update)\s+/i, (m) => m)
    .replace(/\brecords?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Desktop-only panel (hidden below 900px via CSS, see styles.css) — the
 * "more visibility, more features" desktop surface: shows what this role's
 * session can currently do, grouped by module and in plain language rather
 * than raw tool ids, since this is meant to read as "what can I ask for",
 * not an API reference. Scrolls independently once the list is long.
 */
export function DetailPanel() {
  const [caps, setCaps] = useState<Capability[]>([]);

  useEffect(() => {
    api.capabilities().then((r) => setCaps(r.tools)).catch(() => {});
  }, []);

  const groups = new Map<string, Capability[]>();
  for (const c of caps) {
    const key = moduleKey(c.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  return (
    <aside className="detail-panel">
      <h3>What I can help with</h3>
      <div className="cap-groups">
        {[...groups.entries()].map(([key, items]) => (
          <div className="cap-group" key={key}>
            <div className="cap-group-title">{moduleLabel(key)}</div>
            {items.map((c) => (
              <div className="cap-item" key={c.name} title={c.name}>
                {humanizeDescription(c.description)}
              </div>
            ))}
          </div>
        ))}
        {!caps.length && <div className="cap-item">Loading…</div>}
      </div>
    </aside>
  );
}
