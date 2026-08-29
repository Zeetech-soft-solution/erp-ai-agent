import { scanDocumentImage } from "../documentScanner";

describe("scanDocumentImage", () => {
  it("rejects", async () => {
    await expect(scanDocumentImage(Buffer.from(""), "image/jpeg")).rejects.toThrow();
  });
});
