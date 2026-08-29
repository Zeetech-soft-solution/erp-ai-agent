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
      // "modified" - a standard Frappe framework field on every doctype -
      // is what the notification poll filters on (see
      // core/erpnextNotificationSync.ts): "what changed since I last
      // checked", the same generic capability every ERPNext list() call
      // already has, just with this one extra field wired through.
      modified: "modified",
    },
  },
  customer: {
    doctype: "Customer",
    // mobile_no/email_id are Read Only mirror fields, blank in this
    // dataset by construction - erpnextConnector.ts's get() backfills
    // from the linked primary Contact when they're empty (see its
    // doc comment).
    fieldMap: {
      id: "name", display_name: "customer_name", group: "customer_group", territory: "territory",
      email: "email_id", phone: "mobile_no",
    },
  },
  opportunity: {
    doctype: "Opportunity",
    fieldMap: { id: "name", party: "party_name", status: "status", amount: "opportunity_amount", territory: "territory", date: "transaction_date" },
  },
  contact: {
    doctype: "Contact",
    // phone -> "phone", NOT "mobile_no" - confirmed against live data
    // (2026-08-09): of 477 real Contacts, 210 have a populated "phone"
    // field (erpdatabuild's own phone_nos child-table primary entry
    // mirrors here) and ZERO have "mobile_no" populated. "mobile_no" is
    // a real field on this doctype (so no query/write error either
    // way — this was a silent wrong-field bug, not a hard failure,
    // same failure class as lead.source below just without the 404).
    // "mobile" is a distinct, separate field from "phone" on this
    // doctype (mobile_no vs phone) - both real, unpopulated in this
    // dataset's existing contacts but kept independently fetchable
    // rather than folded together, since a future/different contact
    // could genuinely have one without the other.
    fieldMap: { id: "name", display_name: "first_name", email: "email_id", phone: "phone", mobile: "mobile_no", company_name: "company_name" },
  },
  address: {
    doctype: "Address",
    fieldMap: { id: "name", display_name: "address_title", address_type: "address_type", address_line1: "address_line1", city: "city", country: "country", pincode: "pincode" },
  },
  territory: {
    doctype: "Territory",
    fieldMap: { id: "name", display_name: "territory_name", is_group: "is_group" },
  },
};
