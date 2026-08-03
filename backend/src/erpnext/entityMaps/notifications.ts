import { ErpNextEntityMapModule } from "./types";

// ToDo (Frappe's generic assignment doctype) - THE standard ERPNext
// mechanism for "notify a specific person about a specific record,"
// used everywhere in ERPNext's own UI ("Assign To"). Deliberately NOT
// registered as an LLM-facing tool in config/entities.config.ts - this
// exists only for core/erpnextNotificationSync.ts's background poll to
// call systemConnector.list("todo", ...) directly. A SAP (or other)
// connector would map this to whatever ITS equivalent task/assignment
// object is - same canonical shape, different native source.
export const NOTIFICATIONS_MAP: ErpNextEntityMapModule = {
  todo: {
    doctype: "ToDo",
    fieldMap: {
      id: "name",
      reference_type: "reference_type",
      reference_name: "reference_name",
      description: "description",
      status: "status",
      owner: "allocated_to",
      modified: "modified",
    },
  },
};
