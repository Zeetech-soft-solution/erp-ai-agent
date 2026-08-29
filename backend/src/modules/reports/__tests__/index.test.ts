import { systemConnector } from "../../../config/system.config";
import { reportsModule } from "../index";

// The whole point of report.generate: its handler is the ONE tool
// handler in this app guaranteed to never touch real data, so a big
// dataset can never end up back in the LLM's own context (see
// reportGenerator.ts's doc comment). This suite locks that in as an
// actual runtime assertion, not just a comment someone could silently
// break later — every test here spies on systemConnector and asserts
// it was NEVER called, for every branch of the handler, success and
// error alike.
jest.mock("../../../config/system.config", () => ({
  systemConnector: {
    list: jest.fn(),
    runReport: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
    getDocumentPdf: jest.fn(),
  },
}));

describe("reportsModule", () => {
  beforeEach(() => jest.clearAllMocks());

  it("registers exactly report.generate", () => {
    expect(reportsModule.tools.map((t) => t.name)).toEqual(["report.generate"]);
  });

  const tool = () => reportsModule.tools[0];

  it("named_report: returns a /report-pdf URL encoding source/reportKey/filters, never touches systemConnector", async () => {
    const result: any = await tool().handler(
      { source: "named_report", reportKey: "profit_and_loss", filters: { from_date: "2026-01-01", to_date: "2026-03-31" } },
      {} as any
    );
    expect(result.report.url).toBe(
      "/api/agent/report-pdf?source=named_report&reportKey=profit_and_loss&filters=%7B%22from_date%22%3A%222026-01-01%22%2C%22to_date%22%3A%222026-03-31%22%7D"
    );
    expect(result.report.name).toBe("profit_and_loss");
    expect(systemConnector.runReport).not.toHaveBeenCalled();
    expect(systemConnector.list).not.toHaveBeenCalled();
  });

  it("entity_query: returns a /report-pdf URL encoding source/entityKey/filters, never touches systemConnector", async () => {
    const result: any = await tool().handler({ source: "entity_query", entityKey: "quotation", filters: { status: "Open" } }, {} as any);
    expect(result.report.url).toBe("/api/agent/report-pdf?source=entity_query&entityKey=quotation&filters=%7B%22status%22%3A%22Open%22%7D");
    expect(systemConnector.list).not.toHaveBeenCalled();
    expect(systemConnector.runReport).not.toHaveBeenCalled();
  });

  it("entity_query with no filters: URL omits the filters param entirely", async () => {
    const result: any = await tool().handler({ source: "entity_query", entityKey: "quotation" }, {} as any);
    expect(result.report.url).toBe("/api/agent/report-pdf?source=entity_query&entityKey=quotation");
  });

  it("rejects an unknown reportKey with a real error, no URL, no connector call", async () => {
    const result: any = await tool().handler({ source: "named_report", reportKey: "not_a_real_report" }, {} as any);
    expect(result.report).toBeUndefined();
    expect(result.error).toMatch(/Unknown reportKey/);
    expect(systemConnector.runReport).not.toHaveBeenCalled();
  });

  it("rejects an unknown entityKey with a real error, no URL, no connector call", async () => {
    const result: any = await tool().handler({ source: "entity_query", entityKey: "not_a_real_entity" }, {} as any);
    expect(result.report).toBeUndefined();
    expect(result.error).toMatch(/Unknown entityKey/);
    expect(systemConnector.list).not.toHaveBeenCalled();
  });

  it("rejects a missing/invalid source", async () => {
    const result: any = await tool().handler({}, {} as any);
    expect(result.error).toMatch(/source must be/);
    const result2: any = await tool().handler({ source: "something_else" }, {} as any);
    expect(result2.error).toMatch(/source must be/);
  });

  it("never returns rows/data of any kind — only {report:{name,url}} or {error}", async () => {
    const result: any = await tool().handler({ source: "entity_query", entityKey: "quotation" }, {} as any);
    expect(Object.keys(result)).toEqual(["report"]);
    expect(result.report.name).toBe("quotation");
    expect(Object.keys(result.report).sort()).toEqual(["name", "url"]);
  });
});
