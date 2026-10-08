import path from "path";
import { chunkKnowledge, parseKnowledgeMarkdown, readKnowledgeFiles, KNOWLEDGE_ROOT } from "../../../core/knowledgeStore";
import { summarizeWorkflow } from "../../../erpnext/workflow";
import { StaticRolePolicyProvider } from "../../../config/roles.policy";

describe("knowledge base parsing", () => {
  const raw = [
    "---",
    "title: Order to Cash",
    "module: selling",
    "doctypes: Quotation, Sales Order",
    "---",
    "# Order to Cash",
    "Intro line.",
    "",
    "## Quotation",
    "A quotation is an offer.",
    "",
    "## Sales Order",
    "A confirmed order.",
  ].join("\n");

  it("reads front matter", () => {
    const doc = parseKnowledgeMarkdown("erpnext/order-to-cash", raw);
    expect(doc.title).toBe("Order to Cash");
    expect(doc.module).toBe("selling");
    expect(doc.doctypes).toEqual(["Quotation", "Sales Order"]);
  });

  it("falls back to the first heading when there is no front matter", () => {
    expect(parseKnowledgeMarkdown("x", "# Stock Basics\n\ntext").title).toBe("Stock Basics");
  });

  it("makes one labelled chunk per section, prefixed with title and section", () => {
    const chunks = chunkKnowledge(parseKnowledgeMarkdown("erpnext/order-to-cash", raw));
    expect(chunks.map((c) => c.label)).toEqual([
      "knowledge:erpnext/order-to-cash#Overview",
      "knowledge:erpnext/order-to-cash#Quotation",
      "knowledge:erpnext/order-to-cash#Sales Order",
    ]);
    expect(chunks[1].content.startsWith("Order to Cash > Quotation")).toBe(true);
  });

  it("every shipped knowledge document parses with a title, a module and sections", async () => {
    const files = await readKnowledgeFiles(KNOWLEDGE_ROOT);
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const f of files) {
      const doc = parseKnowledgeMarkdown(f.slug, f.raw);
      expect(doc.title).not.toBe(f.slug);
      expect(doc.module).toBeTruthy();
      expect(chunkKnowledge(doc).length).toBeGreaterThan(2);
    }
    expect(path.basename(KNOWLEDGE_ROOT)).toBe("knowledge");
  });
});

describe("workflow summary", () => {
  it("passes ERPNext's workflow definition through as plain data", () => {
    const summary = summarizeWorkflow("Purchase Order", {
      name: "PO Approval",
      workflow_state_field: "workflow_state",
      states: [{ state: "Pending", doc_status: 0, allow_edit: "Purchase User" }, { state: "Approved", doc_status: 1, allow_edit: "Purchase Manager" }],
      transitions: [{ state: "Pending", action: "Approve", next_state: "Approved", allowed: "Purchase Manager", allow_self_approval: 0 }],
    });
    expect(summary.has_workflow).toBe(true);
    expect(summary.states?.[1]).toEqual({ state: "Approved", doc_status: "Submitted", editable_by: "Purchase Manager" });
    expect(summary.transitions?.[0]).toEqual({ from: "Pending", action: "Approve", to: "Approved", allowed_role: "Purchase Manager", condition: null, self_approval: false });
  });
});

describe("knowledge tool grants", () => {
  it("every role gets knowledge.search and workflow.describe", () => {
    const tools = new StaticRolePolicyProvider().resolveAllowedTools(["Employee"]);
    expect(tools).toEqual(expect.arrayContaining(["knowledge.search", "workflow.describe"]));
  });
});
