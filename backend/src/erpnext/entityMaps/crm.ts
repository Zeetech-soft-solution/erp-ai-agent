import { ErpNextEntityMapModule } from "./types";

/** Free tier: lead only — customer/opportunity/contact/address/
 *  territory field mappings are pro-tier. */
export const CRM_MAP: ErpNextEntityMapModule = {
  lead: {
    doctype: "Lead",
    fieldMap: {
      id: "name", display_name: "lead_name", email: "email_id", phone: "mobile_no", status: "status",
      // this ERPNext version replaced the plain "source" Select field with
      // "utm_source", a Link to a "UTM Source" master (modern marketing-
      // attribution tracking) - "source" alone 404s the whole query with
      // "Field not permitted in query: source". Confirmed against the live
      // Lead doctype schema, not assumed.
      source: "utm_source", owner: "lead_owner", company: "company_name", created: "creation",
      // "modified" - a standard Frappe framework field on every doctype -
      // is what the notification poll filters on (see
      // core/erpnextNotificationSync.ts): "what changed since I last
      // checked", the same generic capability every ERPNext list() call
      // already has, just with this one extra field wired through.
      modified: "modified",
    },
  },
};
