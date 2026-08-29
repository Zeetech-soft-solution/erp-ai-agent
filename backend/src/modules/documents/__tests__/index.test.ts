import { documentsModule } from "../index";

describe("documentsModule", () => {
  it("registers document.get_pdf", () => {
    expect(documentsModule.tools.map((t) => t.name)).toEqual(["document.get_pdf"]);
  });

  it("returns a URL pointing at /api/agent/document-pdf with entityKey and id encoded, never the raw PDF bytes", async () => {
    const tool = documentsModule.tools[0];
    const result: any = await tool.handler({ entityKey: "sales_invoice", id: "ACC-SINV-2026-00042" }, {} as any);
    expect(result.document.name).toBe("ACC-SINV-2026-00042");
    expect(result.document.url).toBe("/api/agent/document-pdf?entityKey=sales_invoice&id=ACC-SINV-2026-00042");
  });

  it("URL-encodes special characters in entityKey/id", async () => {
    const tool = documentsModule.tools[0];
    const result: any = await tool.handler({ entityKey: "sales invoice", id: "A/B#1" }, {} as any);
    expect(result.document.url).toBe("/api/agent/document-pdf?entityKey=sales%20invoice&id=A%2FB%231");
  });
});
