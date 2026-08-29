import { ErpNextEntityMapModule } from "./types";

export const PROJECTS_MAP: ErpNextEntityMapModule = {
  project: {
    doctype: "Project",
    fieldMap: {
      id: "name", display_name: "project_name", status: "status", priority: "priority",
      percent_complete: "percent_complete", expected_start_date: "expected_start_date",
      expected_end_date: "expected_end_date", customer: "customer", date: "expected_start_date",
    },
  },
  task: {
    doctype: "Task",
    fieldMap: { id: "name", project: "project", subject: "subject", status: "status", priority: "priority", assigned_to: "_assign", date: "exp_start_date" },
  },
  timesheet: {
    doctype: "Timesheet",
    fieldMap: {
      id: "name", employee: "employee", customer: "customer", status: "status",
      start_date: "start_date", end_date: "end_date", total_hours: "total_hours", per_billed: "per_billed",
      date: "start_date",
    },
  },
};
