import { ErpNextEntityMapModule } from "./types";

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
    },
  },
  customer: {
    doctype: "Customer",
    fieldMap: { id: "name", display_name: "customer_name", group: "customer_group", territory: "territory" },
  },
  opportunity: {
    doctype: "Opportunity",
    fieldMap: { id: "name", party: "party_name", status: "status", amount: "opportunity_amount" },
  },
};
