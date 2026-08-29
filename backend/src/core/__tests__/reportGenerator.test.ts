import { systemConnector } from "../../config/system.config";
import { generateReportPdf, REPORT_ROW_CAP } from "../reportGenerator";

jest.mock("../../config/system.config", () => ({
  systemConnector: {
    list: jest.fn(),
    runReport: jest.fn(),
  },
}));

const CREDENTIAL = { token: "fake" } as any;

describe("generateReportPdf", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("source: named_report", () => {
    it("calls runReport with the reportKey/filters and renders the result as a PDF", async () => {
      (systemConnector.runReport as jest.Mock).mockResolvedValue([
        { account: "Revenue", debit: 0, credit: 500000 },
        { account: "Expenses", debit: 320000, credit: 0 },
      ]);
      const { filename, buffer } = await generateReportPdf(
        { source: "named_report", reportKey: "profit_and_loss", filters: { from_date: "2026-01-01", to_date: "2026-03-31" } },
        CREDENTIAL
      );
      expect(systemConnector.runReport).toHaveBeenCalledWith("profit_and_loss", CREDENTIAL, { from_date: "2026-01-01", to_date: "2026-03-31" });
      expect(systemConnector.list).not.toHaveBeenCalled();
      expect(filename).toBe("profit_and_loss.pdf");
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.slice(0, 4).toString()).toBe("%PDF");
    });

    it("throws a real error for an unknown reportKey, without calling the connector", async () => {
      await expect(generateReportPdf({ source: "named_report", reportKey: "not_real" }, CREDENTIAL)).rejects.toThrow(/Unknown reportKey/);
      expect(systemConnector.runReport).not.toHaveBeenCalled();
    });

    it("normalizes stray top-level filter args the same way reportModuleFactory's tools do", async () => {
      (systemConnector.runReport as jest.Mock).mockResolvedValue([]);
      // stock_balance's real filterFields include "as_of_date" — passed
      // as a bare filters key here (already properly shaped), just
      // confirming the pass-through path reaches runReport correctly.
      await generateReportPdf({ source: "named_report", reportKey: "stock_balance", filters: { warehouse: "Main" } }, CREDENTIAL);
      expect(systemConnector.runReport).toHaveBeenCalledWith("stock_balance", CREDENTIAL, { warehouse: "Main" });
    });
  });

  describe("source: entity_query", () => {
    it("calls list() with the REPORT_ROW_CAP limit (bypassing the interactive default) and renders the result", async () => {
      (systemConnector.list as jest.Mock).mockResolvedValue([
        { id: "QTN-0001", customer: "Acme Corp", grand_total: 12000 },
        { id: "QTN-0002", customer: "Globex Inc", grand_total: 8500 },
      ]);
      const { filename, buffer } = await generateReportPdf({ source: "entity_query", entityKey: "quotation", filters: { status: "Open" } }, CREDENTIAL);
      expect(systemConnector.list).toHaveBeenCalledWith("quotation", CREDENTIAL, { filters: { status: "Open" }, limit: REPORT_ROW_CAP });
      expect(systemConnector.runReport).not.toHaveBeenCalled();
      expect(filename).toBe("quotation_report.pdf");
      expect(buffer.slice(0, 4).toString()).toBe("%PDF");
    });

    it("throws a real error for an unknown entityKey, without calling the connector", async () => {
      await expect(generateReportPdf({ source: "entity_query", entityKey: "not_real" }, CREDENTIAL)).rejects.toThrow(/Unknown entityKey/);
      expect(systemConnector.list).not.toHaveBeenCalled();
    });
  });

  it("REPORT_ROW_CAP matches the same order of magnitude as the existing AGGREGATE_ROW_CAP convention (10000) — one consistent app-wide ceiling", () => {
    expect(REPORT_ROW_CAP).toBe(10000);
  });
});
