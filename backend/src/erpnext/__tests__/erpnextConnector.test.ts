import axios from "axios";
import { toFilterTriple, buildNoNativeFieldMappingError, ErpNextConnector } from "../erpnextConnector";

describe("toFilterTriple", () => {
  it("defaults a bare (non-object) value to an equality filter", () => {
    expect(toFilterTriple("status", "Open")).toEqual(["status", "=", "Open"]);
  });

  it("passes through the documented {op, value} contract", () => {
    expect(toFilterTriple("total", { op: ">", value: 1000 })).toEqual(["total", ">", 1000]);
    expect(toFilterTriple("customer", { op: "like", value: "%Acme%" })).toEqual(["customer", "like", "%Acme%"]);
  });

  it("resolves a relative-period filter into a real [start, end] date pair via resolveRelativePeriod", () => {
    const [field, op, value] = toFilterTriple("transaction_date", { op: "relative", value: "today" });
    expect(field).toBe("transaction_date");
    expect(op).toBe("between");
    // "today" resolves to [todayIso, todayIso] regardless of which day
    // this suite runs on, so both ends must be equal and a real date.
    expect(Array.isArray(value)).toBe(true);
    expect(value[0]).toBe(value[1]);
    expect(value[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // Confirmed live via interaction_log: the model occasionally emits
  // Mongo-style operator keys instead of the documented {op,value}
  // contract (a training-data habit) — normalizing these here is the
  // actual fix for a "customer starts with Shree" search silently
  // returning nothing.
  it.each([
    [{ $eq: "Acme" }, "="],
    [{ $ne: "Acme" }, "!="],
    [{ $like: "%Acme%" }, "like"],
    [{ $regex: "%Acme%" }, "like"],
    [{ $in: ["A", "B"] }, "in"],
    [{ $gt: 5 }, ">"],
    [{ $lt: 5 }, "<"],
    [{ $gte: 5 }, ">="],
    [{ $lte: 5 }, "<="],
  ])("normalizes Mongo-style alias %j to op %s", (raw, expectedOp) => {
    const [, op, value] = toFilterTriple("field", raw);
    expect(op).toBe(expectedOp);
    expect(value).toEqual((raw as Record<string, unknown>)[Object.keys(raw as object)[0]]);
  });

  it("falls through to an equality filter on an array value (never mistaken for the op-object shape)", () => {
    expect(toFilterTriple("status", ["Open", "Replied"])).toEqual(["status", "=", ["Open", "Replied"]]);
  });

  it("falls through to equality when given an object with neither 'op' nor a known Mongo alias", () => {
    expect(toFilterTriple("field", { unrelated: "shape" })).toEqual(["field", "=", { unrelated: "shape" }]);
  });

  it("treats null and undefined as plain equality values", () => {
    expect(toFilterTriple("field", null)).toEqual(["field", "=", null]);
    expect(toFilterTriple("field", undefined)).toEqual(["field", "=", undefined]);
  });

  // Confirmed live 2026-08-12: {"op":"like","value":"Sai Controls"} against
  // a real customer named "Sai Controls LLP" returned ZERO rows.
  // ERPNext's REST API "like" operator does NOT auto-wrap the value with
  // SQL wildcards — an un-wildcarded "like" behaves as an exact match,
  // same as "=". The model's own tool-description contract never told it
  // to add "%" itself, so this was silently broken for every "like"
  // filter on every entity.
  describe("'like' filters are auto-wrapped with wildcards when missing", () => {
    it("wraps a plain {op:'like'} value with wildcards", () => {
      expect(toFilterTriple("party", { op: "like", value: "Sai Controls" })).toEqual(["party", "like", "%Sai Controls%"]);
    });

    it("does not double-wrap a value that already has wildcards", () => {
      expect(toFilterTriple("customer", { op: "like", value: "%Acme%" })).toEqual(["customer", "like", "%Acme%"]);
      expect(toFilterTriple("customer", { op: "like", value: "Acme%" })).toEqual(["customer", "like", "Acme%"]);
    });

    it("wraps the Mongo-style $like/$regex alias the same way", () => {
      expect(toFilterTriple("field", { $like: "Sai Controls" })).toEqual(["field", "like", "%Sai Controls%"]);
      expect(toFilterTriple("field", { $regex: "Sai Controls" })).toEqual(["field", "like", "%Sai Controls%"]);
    });

    it("never wraps a non-'like' op, even if the value happens to be a string", () => {
      expect(toFilterTriple("status", { op: "=", value: "Open" })).toEqual(["status", "=", "Open"]);
    });

    it("leaves a non-string 'like' value untouched rather than coercing it", () => {
      expect(toFilterTriple("field", { op: "like", value: null })).toEqual(["field", "like", null]);
    });
  });

  // Confirmed live via pm2 error log 2026-08-12: leave_application.list /
  // leave_allocation.list both crashed with a raw Frappe-side
  // "KeyError: 'greater_than_equal'" — the model used the documented
  // {op, value} shape but spelled the operator in words instead of
  // ">=". That went straight through uncast into ERPNext's own filter
  // engine, which doesn't understand word-form operators. Fixed by
  // normalizing common word forms the same way $-prefixed Mongo aliases
  // already are, and rejecting anything still unrecognized with a clean
  // app-level error instead of forwarding it to crash on the ERPNext side.
  describe("word-form operators are normalized to their symbol equivalents", () => {
    it.each([
      ["greater_than_equal", ">="],
      ["greater_than_equals", ">="],
      ["greater_or_equal", ">="],
      ["less_than_equal", "<="],
      ["less_than_equals", "<="],
      ["less_or_equal", "<="],
      ["greater_than", ">"],
      ["less_than", "<"],
      ["equal", "="],
      ["equals", "="],
      ["not_equal", "!="],
      ["not_equals", "!="],
      ["contains", "like"],
    ])("normalizes op %j to %s", (wordOp, expectedOp) => {
      const [, op] = toFilterTriple("from_date", { op: wordOp, value: "2026-07-01" });
      expect(op).toBe(expectedOp);
    });

    it("still throws a clean error on a genuinely unknown operator, instead of forwarding it to ERPNext", () => {
      expect(() => toFilterTriple("field", { op: "totally_made_up", value: 1 })).toThrow(
        /Unknown filter operator "totally_made_up"/
      );
    });
  });
});

// Confirmed live 2026-08-12: "highest paid employee" retried
// analytics.aggregate on entityKey:"employee" three times with three
// different wrong field guesses ("salary", "ctc", "net_pay") — Employee
// genuinely has none of these; compensation lives on the linked Salary
// Structure Assignment (ctc) or a specific Salary Slip (net_pay).
describe("buildNoNativeFieldMappingError", () => {
  const EMPLOYEE_FIELDS = ["id", "display_name", "department", "designation", "status", "email"];

  it("still states the real canonical fields, same as before the redirect existed", () => {
    const message = buildNoNativeFieldMappingError("employee", "salary", EMPLOYEE_FIELDS);
    expect(message).toContain('"salary" has no native mapping for "employee"');
    expect(message).toContain(EMPLOYEE_FIELDS.join(", "));
  });

  it.each(["salary", "ctc", "net_pay", "pay", "compensation"])(
    "redirects a known employee-compensation field guess (%s) to the real entity that holds it",
    (field) => {
      const message = buildNoNativeFieldMappingError("employee", field, EMPLOYEE_FIELDS);
      expect(message).toMatch(/salary_structure_assignment\.ctc|salary_slip\.net_pay/);
    }
  );

  it("is case-insensitive on the field guess", () => {
    expect(buildNoNativeFieldMappingError("employee", "SALARY", EMPLOYEE_FIELDS)).toContain("salary_structure_assignment.ctc");
    expect(buildNoNativeFieldMappingError("employee", "CTC", EMPLOYEE_FIELDS)).toContain("salary_structure_assignment.ctc");
  });

  it("adds no redirect for an entity/field pair with no known confusion", () => {
    const message = buildNoNativeFieldMappingError("quotation", "made_up_field", ["id", "status", "total"]);
    expect(message).not.toMatch(/salary_structure_assignment|salary_slip/);
    expect(message).toBe('"made_up_field" has no native mapping for "quotation" — the real canonical fields for this entity are: id, status, total. Use one of those as "field".');
  });

  it("adds no redirect for an unrelated field on employee (not a compensation guess)", () => {
    const message = buildNoNativeFieldMappingError("employee", "made_up_field", EMPLOYEE_FIELDS);
    expect(message).not.toMatch(/salary_structure_assignment|salary_slip/);
  });
});

// Confirmed live 2026-08-16: a real user with only "System Manager" got
// genuine ERPNext 403s on Payroll Entry/Sales Invoice/GL Entry despite
// roles.policy.ts already granting System Manager every TOOL ("*") —
// ERPNext's own per-doctype DocPerm is a separate, narrower layer that
// role doesn't automatically clear. isFullAccessRole() is what
// auth/erpnextAuth.ts checks to decide whether to stamp
// credential.fullAccess=true, which lets clientFor()'s read-only branch
// fall back to the service credential for that person's reads.
describe("ErpNextConnector.isFullAccessRole", () => {
  const connector = new ErpNextConnector();

  it.each(["System Manager", "Administrator"])("treats %s as full access", (role) => {
    expect(connector.isFullAccessRole([role])).toBe(true);
  });

  it("is true if the role is anywhere in a mixed role list", () => {
    expect(connector.isFullAccessRole(["Sales User", "System Manager"])).toBe(true);
  });

  it("is false for ordinary business roles, even several at once", () => {
    expect(connector.isFullAccessRole(["Sales User", "Accounts User", "HR User"])).toBe(false);
  });

  it("is false for an empty role list", () => {
    expect(connector.isFullAccessRole([])).toBe(false);
  });
});

// Confirmed live 2026-08-17: a real user asked to "make me a payment
// entry" for an invoice — there was no payment_entry.create tool at all.
// New 2026-08-17: createPaymentEntryForInvoice leans on ERPNext's own
// whitelisted get_payment_entry (the same call its "Create > Payment"
// desk button makes) to derive the receiving account/currency/allocation
// correctly, rather than hand-assembling those from flat fields.
jest.mock("../client", () => ({
  __esModule: true,
  default: {},
  getDocList: jest.fn(),
  getDoc: jest.fn(),
  createDoc: jest.fn(),
  updateDoc: jest.fn(),
}));

describe("ErpNextConnector.createPaymentEntryForInvoice", () => {
  const { createDoc, updateDoc } = require("../client");
  const connector = new ErpNextConnector();
  const credential = { mode: "api_key", apiKey: "k", apiSecret: "s" } as any;

  const derivedTemplate = {
    payment_type: "Receive",
    party_type: "Customer",
    party: "Suryodaya Controls LLP",
    paid_to: "Cash - SEMPL",
    paid_amount: 92416,
    received_amount: 92416,
    references: [{ reference_doctype: "Sales Invoice", reference_name: "ACC-SINV-2026-00973", allocated_amount: 92416 }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.create as jest.Mock) = jest.fn(() => ({
      post: jest.fn().mockResolvedValue({ data: { message: derivedTemplate } }),
    }));
    createDoc.mockResolvedValue({ name: "ACC-PAY-2026-00042", ...derivedTemplate });
    updateDoc.mockResolvedValue({ name: "ACC-PAY-2026-00042", docstatus: 1, ...derivedTemplate });
  });

  it("derives the payment template from ERPNext's own get_payment_entry, then inserts it as a real Payment Entry", async () => {
    const result = await connector.createPaymentEntryForInvoice(credential, "ACC-SINV-2026-00973");

    const mockClient = (axios.create as jest.Mock).mock.results[0].value;
    expect(mockClient.post).toHaveBeenCalledWith(
      "/api/method/erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry",
      { dt: "Sales Invoice", dn: "ACC-SINV-2026-00973" }
    );
    expect(createDoc).toHaveBeenCalledWith(
      "Payment Entry",
      { doctype: "Payment Entry", ...derivedTemplate, reference_no: "REF-ACC-SINV-2026-00973", reference_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
      mockClient
    );
    expect(result.id).toBe("ACC-PAY-2026-00042");
  });

  // Confirmed live 2026-08-17, verified on a real small entry (correct GL
  // accounts, exact invoice balance reduction, balanced debit/credit)
  // before this was wired in: unlike every other *.create tool here
  // (which stay Draft), this one submits for real — the confirm-before-
  // create round trip this tool's own description requires (showing the
  // real invoice/amount/party) IS the human review step for this action.
  it("submits the created document for real (docstatus 0 -> 1) — this one does NOT stay a Draft, by explicit product decision", async () => {
    await connector.createPaymentEntryForInvoice(credential, "ACC-SINV-2026-00973");
    const mockClient = (axios.create as jest.Mock).mock.results[0].value;
    expect(updateDoc).toHaveBeenCalledWith("Payment Entry", "ACC-PAY-2026-00042", { docstatus: 1 }, mockClient);
  });

  it("returns the SUBMITTED document's own data (post-submit), not the pre-submit draft", async () => {
    updateDoc.mockResolvedValue({ name: "ACC-PAY-2026-00042", status: "Submitted", ...derivedTemplate });
    const result = await connector.createPaymentEntryForInvoice(credential, "ACC-SINV-2026-00973");
    expect(result.status).toBe("Submitted");
  });

  // Confirmed live 2026-08-17: calling this method as a GET with amount in
  // the query string crashed inside ERPNext's own code with "bad operand
  // type for abs(): 'str'" — an HTTP query string is always text, and
  // get_payment_entry does real arithmetic on party_amount without casting
  // it. Locks in that this stays a POST with a real JSON body, which
  // preserves the actual number type, not a query-string GET.
  it("passes a specific partial amount through as a real number, via a JSON body — never a query string", async () => {
    await connector.createPaymentEntryForInvoice(credential, "ACC-SINV-2026-00973", 5000);
    const mockClient = (axios.create as jest.Mock).mock.results[0].value;
    const [, body] = mockClient.post.mock.calls[0];
    expect(body.party_amount).toBe(5000);
    expect(typeof body.party_amount).toBe("number");
  });

  it("throws a clear error if ERPNext returns no template (e.g. an already-fully-paid or cancelled invoice)", async () => {
    (axios.create as jest.Mock) = jest.fn(() => ({ post: jest.fn().mockResolvedValue({ data: {} }) }));
    await expect(connector.createPaymentEntryForInvoice(credential, "ACC-SINV-2026-00999")).rejects.toThrow(
      /did not return a payment entry template/
    );
    expect(createDoc).not.toHaveBeenCalled();
  });

  it("never submits the created document itself — stays a Draft, same as every other *.create tool here", async () => {
    await connector.createPaymentEntryForInvoice(credential, "ACC-SINV-2026-00973");
    const [, payload] = createDoc.mock.calls[0];
    expect(payload.docstatus).toBeUndefined();
  });
});

// New 2026-08-19: modules/inboxActions's two real connector methods.
// replyToCommunication reuses ERPNext's own real whitelisted
// frappe.core.doctype.communication.email.make (the exact function the
// desk's "Reply" button calls) — never a hand-assembled sendmail() or a
// raw Communication insert(). markNotificationRead reuses Frappe's own
// privileged mark_as_read() — Notification Log's real DocPerm grants
// read/share to "All" but no write at all, so a generic update would
// 403 for an ordinary user.
describe("ErpNextConnector.replyToCommunication", () => {
  const { getDoc } = require("../client");
  const connector = new ErpNextConnector();
  const credential = { mode: "api_key", apiKey: "k", apiSecret: "s" } as any;

  const original = {
    name: "COMM-1",
    subject: "Question about pricing",
    sender: "customer@example.com",
    reference_doctype: "Quotation",
    reference_name: "SAL-QTN-2026-01113",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getDoc.mockResolvedValue(original);
    (axios.create as jest.Mock) = jest.fn(() => ({
      post: jest.fn().mockResolvedValue({ data: { message: { name: "COMM-2" } } }),
    }));
  });

  it("fetches the original Communication, then calls ERPNext's own real email.make with real threading", async () => {
    await connector.replyToCommunication(credential, { communicationId: "COMM-1", replyBody: "Here's the pricing." });
    const mockClient = (axios.create as jest.Mock).mock.results[0].value;
    expect(mockClient.post).toHaveBeenCalledWith(
      "/api/method/frappe.core.doctype.communication.email.make",
      expect.objectContaining({
        doctype: "Quotation",
        name: "SAL-QTN-2026-01113",
        content: "Here's the pricing.",
        subject: "Re: Question about pricing",
        recipients: "customer@example.com",
        send_email: 1,
        in_reply_to: "COMM-1",
      })
    );
  });

  it("never double-prefixes an already-'Re:' subject", async () => {
    getDoc.mockResolvedValue({ ...original, subject: "Re: Question about pricing" });
    await connector.replyToCommunication(credential, { communicationId: "COMM-1", replyBody: "Follow-up." });
    const mockClient = (axios.create as jest.Mock).mock.results[0].value;
    const [, body] = mockClient.post.mock.calls[0];
    expect(body.subject).toBe("Re: Question about pricing");
  });

  it("attaches a real print_format only when explicitly asked AND the original email is linked to a real document", async () => {
    await connector.replyToCommunication(credential, { communicationId: "COMM-1", replyBody: "See attached.", attachPrintFormat: "Standard" });
    const mockClient = (axios.create as jest.Mock).mock.results[0].value;
    const [, body] = mockClient.post.mock.calls[0];
    expect(body.print_format).toBe("Standard");
  });

  it("never sets print_format when not asked, even though the email IS linked to a real document", async () => {
    await connector.replyToCommunication(credential, { communicationId: "COMM-1", replyBody: "No attachment needed." });
    const mockClient = (axios.create as jest.Mock).mock.results[0].value;
    const [, body] = mockClient.post.mock.calls[0];
    expect(body.print_format).toBeUndefined();
  });

  it("never sets print_format for an unlinked email, even if attachPrintFormat was passed — nothing real to render", async () => {
    getDoc.mockResolvedValue({ ...original, reference_doctype: undefined, reference_name: undefined });
    await connector.replyToCommunication(credential, { communicationId: "COMM-1", replyBody: "Hi.", attachPrintFormat: "Standard" });
    const mockClient = (axios.create as jest.Mock).mock.results[0].value;
    const [, body] = mockClient.post.mock.calls[0];
    expect(body.print_format).toBeUndefined();
  });

  it("throws a clear error when the original communication doesn't exist", async () => {
    getDoc.mockResolvedValue(undefined);
    await expect(connector.replyToCommunication(credential, { communicationId: "COMM-404", replyBody: "Hi." })).rejects.toThrow(/No such email/);
  });
});

describe("ErpNextConnector.markNotificationRead", () => {
  const connector = new ErpNextConnector();
  const credential = { mode: "api_key", apiKey: "k", apiSecret: "s" } as any;

  it("calls Frappe's own real, privileged mark_as_read — never a generic doc update", async () => {
    const post = jest.fn().mockResolvedValue({ data: { message: null } });
    (axios.create as jest.Mock) = jest.fn(() => ({ post }));
    const result = await connector.markNotificationRead(credential, "NL-1");
    expect(post).toHaveBeenCalledWith("/api/method/frappe.desk.doctype.notification_log.notification_log.mark_as_read", { docname: "NL-1" });
    expect(result).toEqual({ ok: true, id: "NL-1" });
  });
});
