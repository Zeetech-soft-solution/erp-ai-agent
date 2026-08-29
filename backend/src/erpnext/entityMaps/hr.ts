import { ErpNextEntityMapModule } from "./types";

export const HR_MAP: ErpNextEntityMapModule = {
  employee: {
    doctype: "Employee",
    // email/phone added 2026-08-10 — confirmed live: an HR Manager asking
    // for "contact details" for a department got names/ids back but no
    // actual email or phone, because canonicalFields never included them
    // at all (unlike supplier/contact, which already had this). Employee's
    // OWN email fields (company_email/personal_email/prefered_email) and
    // its Mobile field (cell_number) are confirmed 0/96 populated in this
    // dataset — a dead end, same shape as customer/supplier's blank
    // header mirrors below. "user_id" (the linked ERPNext User account)
    // IS populated for all 96, and its value already IS the person's real
    // email — no backfill needed, direct field map. Phone has no such
    // shortcut (the value lives on the User doc, not a field on Employee
    // itself) — see backfillEmployeePhone() in erpnextConnector.ts.
    fieldMap: {
      id: "name", display_name: "employee_name", department: "department", designation: "designation",
      status: "status", email: "user_id",
    },
  },
  leave_application: {
    doctype: "Leave Application",
    fieldMap: {
      id: "name", employee: "employee", leave_type: "leave_type", department: "department",
      from_date: "from_date", to_date: "to_date", total_leave_days: "total_leave_days", status: "status",
      date: "posting_date",
    },
  },
  attendance: {
    doctype: "Attendance",
    fieldMap: { id: "name", employee: "employee", department: "department", date: "attendance_date", status: "status" },
  },
  salary_slip: {
    doctype: "Salary Slip",
    fieldMap: {
      id: "name", employee: "employee", department: "department", status: "status", net_pay: "net_pay",
      total_earnings: "total_earnings", total_deduction: "total_deduction", start_date: "start_date", end_date: "end_date",
      date: "posting_date",
    },
  },
  job_opening: {
    doctype: "Job Opening",
    fieldMap: { id: "name", display_name: "job_title", department: "department", designation: "designation", status: "status", date: "posted_on" },
  },
  leave_allocation: {
    doctype: "Leave Allocation",
    fieldMap: {
      id: "name", employee: "employee", leave_type: "leave_type", from_date: "from_date",
      to_date: "to_date", new_leaves_allocated: "new_leaves_allocated", total_leaves_allocated: "total_leaves_allocated",
      date: "from_date",
    },
  },
  salary_structure: {
    doctype: "Salary Structure",
    fieldMap: { id: "name", is_active: "is_active", net_pay: "net_pay" },
  },
  salary_structure_assignment: {
    doctype: "Salary Structure Assignment",
    fieldMap: { id: "name", employee: "employee", salary_structure: "salary_structure", from_date: "from_date", base: "base", ctc: "ctc", date: "from_date" },
  },
  payroll_entry: {
    doctype: "Payroll Entry",
    fieldMap: { id: "name", status: "status", start_date: "start_date", end_date: "end_date", payroll_frequency: "payroll_frequency", date: "posting_date" },
  },
  employee_advance: {
    doctype: "Employee Advance",
    fieldMap: {
      id: "name", employee: "employee", date: "posting_date", advance_amount: "advance_amount", purpose: "purpose",
      status: "status", paid_amount: "paid_amount", pending_amount: "pending_amount",
    },
  },
  expense_claim: {
    doctype: "Expense Claim",
    fieldMap: {
      id: "name", employee: "employee", posting_date: "posting_date", approval_status: "approval_status",
      status: "status", total_claimed_amount: "total_claimed_amount", total_sanctioned_amount: "total_sanctioned_amount",
      expense_approver: "expense_approver", date: "posting_date",
    },
    // Expense Claim Detail's field names confirmed against the live
    // child-table schema, not assumed - same discipline as
    // selling.ts's quotation/items comment.
    childTables: {
      expenses: { nativeField: "expenses", fieldMap: { expense_type: "expense_type", amount: "amount", cost_center: "cost_center" } },
    },
  },
  job_applicant: {
    doctype: "Job Applicant",
    fieldMap: { id: "name", applicant_name: "applicant_name", email: "email_id", phone: "phone_number", job_title: "job_title", designation: "designation", status: "status" },
  },
  interview: {
    doctype: "Interview",
    fieldMap: {
      id: "name", interview_type: "interview_type", job_applicant: "job_applicant", job_opening: "job_opening",
      designation: "designation", status: "status", scheduled_on: "scheduled_on", date: "scheduled_on",
    },
  },
  job_offer: {
    doctype: "Job Offer",
    fieldMap: { id: "name", job_applicant: "job_applicant", status: "status", offer_date: "offer_date", designation: "designation", date: "offer_date" },
  },
  appraisal_cycle: {
    doctype: "Appraisal Cycle",
    fieldMap: { id: "name", status: "status", start_date: "start_date", end_date: "end_date", date: "start_date" },
  },
  appraisal: {
    doctype: "Appraisal",
    fieldMap: { id: "name", employee: "employee", appraisal_cycle: "appraisal_cycle", final_score: "final_score", start_date: "start_date", end_date: "end_date", date: "start_date" },
  },
  shift_type: {
    doctype: "Shift Type",
    fieldMap: { id: "name", start_time: "start_time", end_time: "end_time", enable_auto_attendance: "enable_auto_attendance" },
  },
  shift_assignment: {
    doctype: "Shift Assignment",
    fieldMap: { id: "name", employee: "employee", shift_type: "shift_type", status: "status", start_date: "start_date", end_date: "end_date", date: "start_date" },
  },
  department: {
    doctype: "Department",
    fieldMap: { id: "name", display_name: "department_name", is_group: "is_group", disabled: "disabled" },
  },
  designation: {
    doctype: "Designation",
    fieldMap: { id: "name", display_name: "designation_name" },
  },
  training_event: {
    doctype: "Training Event",
    fieldMap: { id: "name", event_name: "event_name", type: "type", start_time: "start_time", end_time: "end_time", date: "start_time" },
  },
};
