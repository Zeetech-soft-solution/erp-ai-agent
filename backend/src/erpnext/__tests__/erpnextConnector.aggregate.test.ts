import { ErpNextConnector } from "../erpnextConnector";

// Own dedicated mock of ../client (separate from erpnextConnector.test.ts's
// own jest.mock of the same module) so count()/aggregate()'s new
// callMethod dependency doesn't have to be threaded through every other
// test file that happens to import erpnextConnector.ts.
jest.mock("../client", () => ({
  __esModule: true,
  default: {},
  getDocList: jest.fn(),
  getDoc: jest.fn(),
  createDoc: jest.fn(),
  updateDoc: jest.fn(),
  callMethod: jest.fn(),
}));

// erpnextConnector.ts's list() reads the page-size default from
// settingsService — stub it out so list()'s own tests below don't need a
// real Postgres pool, same "own the boundary" reasoning as the ../client mock.
jest.mock("../../core/settingsService", () => ({
  settingsService: { get: jest.fn() },
}));

const { getDocList, callMethod } = require("../client");
const { settingsService } = require("../../core/settingsService");

describe("ErpNextConnector.count", () => {
  const connector = new ErpNextConnector();
  const credential = { mode: "api_key", apiKey: "k", apiSecret: "s" } as any;

  beforeEach(() => jest.clearAllMocks());

  it("calls frappe.client.get_count with the real doctype and native filters, zero rows fetched", async () => {
    callMethod.mockResolvedValue(975);
    const result = await connector.count("sales_invoice", credential, { status: "Open" });
    expect(callMethod).toHaveBeenCalledWith(
      "frappe.client.get_count",
      { doctype: "Sales Invoice", filters: JSON.stringify([["status", "=", "Open"]]) },
      expect.anything()
    );
    expect(getDocList).not.toHaveBeenCalled();
    expect(result).toBe(975);
  });

  it("coerces a string count (some RPC paths return numeric strings) to a real number", async () => {
    callMethod.mockResolvedValue("42");
    expect(await connector.count("sales_invoice", credential)).toBe(42);
  });

  it("omits filters entirely when none were given", async () => {
    callMethod.mockResolvedValue(10);
    await connector.count("sales_invoice", credential);
    const [, params] = callMethod.mock.calls[0];
    expect(params.filters).toBeUndefined();
  });
});

describe("ErpNextConnector.aggregate — op:count shortcuts to count(), no row fetch", () => {
  const connector = new ErpNextConnector();
  const credential = { mode: "api_key", apiKey: "k", apiSecret: "s" } as any;

  beforeEach(() => jest.clearAllMocks());

  it("bare count with no groupBy never calls getDocList, at any population size", async () => {
    callMethod.mockResolvedValue(58000); // way over AGGREGATE_ROW_CAP
    const result = await connector.aggregate("sales_invoice", credential, { op: "count" });
    expect(result).toEqual({ overall: { value: 58000, count: 58000 } });
    expect(getDocList).not.toHaveBeenCalled();
  });
});

describe("ErpNextConnector.aggregate — under the cap, single fetch-and-reduce (unchanged behavior)", () => {
  const connector = new ErpNextConnector();
  const credential = { mode: "api_key", apiKey: "k", apiSecret: "s" } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    callMethod.mockResolvedValue(3); // total population under cap
    getDocList.mockResolvedValue([{ name: "A", grand_total: 100 }, { name: "B", grand_total: 250 }, { name: "C", grand_total: 50 }]);
  });

  it("sums correctly and only fetches once", async () => {
    const result = await connector.aggregate("sales_invoice", credential, { field: "total", op: "sum" });
    expect(result.overall).toEqual({ value: 400, count: 3 });
    expect(getDocList).toHaveBeenCalledTimes(1);
  });

  it("computes a real weighted average, not a naive one", async () => {
    const result = await connector.aggregate("sales_invoice", credential, { field: "total", op: "avg" });
    expect(result.overall.value).toBeCloseTo(400 / 3);
  });

  it("min/max read the real extremes", async () => {
    const min = await connector.aggregate("sales_invoice", credential, { field: "total", op: "min" });
    const max = await connector.aggregate("sales_invoice", credential, { field: "total", op: "max" });
    expect(min.overall.value).toBe(50);
    expect(max.overall.value).toBe(250);
  });
});

describe("ErpNextConnector.aggregate — over the cap WITH a date-range filter, chunks and combines exactly", () => {
  const connector = new ErpNextConnector();
  const credential = { mode: "api_key", apiKey: "k", apiSecret: "s" } as any;
  const CAP = 10000;

  function dateRangeFrom(paramsFilters: string | undefined): [string, string] | null {
    if (!paramsFilters) return null;
    const triples = JSON.parse(paramsFilters);
    const dateTriple = triples.find((t: any) => t[0] === "posting_date");
    return dateTriple ? dateTriple[2] : null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    // Whole range (2 years) is over the cap; bisecting once lands both
    // halves under it — exercises exactly one level of real recursion.
    callMethod.mockImplementation(async (_method: string, params: any) => {
      const range = dateRangeFrom(params.filters);
      if (!range) throw new Error("count() called with no date filter — unexpected in this test");
      const [start, end] = range;
      if (start === "2024-01-01" && end === "2025-12-31") return CAP + 5000; // full range, over cap
      if (start === "2024-01-01") return 4000; // first half, under cap
      return 6000; // second half, under cap
    });
    getDocList.mockImplementation(async (_doctype: string, params: any) => {
      const range = dateRangeFrom(params.filters);
      const [start] = range!;
      // Distinct, easily-checked values per half so a wrong combine (e.g.
      // only using one half, or double-counting) fails visibly.
      if (start === "2024-01-01") return [{ name: "H1a", grand_total: 1000 }, { name: "H1b", grand_total: 2000 }];
      return [{ name: "H2a", grand_total: 500 }];
    });
  });

  const filters = { date: { op: "between", value: ["2024-01-01", "2025-12-31"] } };

  it("sums both halves together into one exact total", async () => {
    const result = await connector.aggregate("sales_invoice", credential, { field: "total", op: "sum", filters });
    expect(result.overall).toEqual({ value: 3500, count: 3 });
  });

  it("computes a real cross-chunk weighted average, not an average of the two chunk averages", async () => {
    const result = await connector.aggregate("sales_invoice", credential, { field: "total", op: "avg", filters });
    // naive average-of-averages would be ((1000+2000)/2 + 500)/2 = 875 — wrong.
    expect(result.overall.value).toBeCloseTo(3500 / 3);
    expect(result.overall.value).not.toBeCloseTo(875);
  });

  it("min/max span across both chunks correctly", async () => {
    const min = await connector.aggregate("sales_invoice", credential, { field: "total", op: "min", filters });
    const max = await connector.aggregate("sales_invoice", credential, { field: "total", op: "max", filters });
    expect(min.overall.value).toBe(500);
    expect(max.overall.value).toBe(2000);
  });

  it("never fetches more than the two under-cap leaf chunks (no full-range fetch attempted)", async () => {
    await connector.aggregate("sales_invoice", credential, { field: "total", op: "sum", filters });
    expect(getDocList).toHaveBeenCalledTimes(2);
  });
});

describe("ErpNextConnector.aggregate — over the cap with NO date filter falls back to a capped, warned fetch", () => {
  const connector = new ErpNextConnector();
  const credential = { mode: "api_key", apiKey: "k", apiSecret: "s" } as any;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    callMethod.mockResolvedValue(50000); // over cap, no date-shaped filter given
    getDocList.mockResolvedValue([{ name: "A", grand_total: 100 }]);
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  it("still returns a (possibly partial) number rather than throwing, and warns about it", async () => {
    const result = await connector.aggregate("sales_invoice", credential, { field: "total", op: "sum", filters: { status: "Open" } });
    expect(result.overall.value).toBe(100);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no date-range filter to chunk on"));
  });
});

describe("ErpNextConnector.aggregate — groupBy merges the same group key across chunks", () => {
  const connector = new ErpNextConnector();
  const credential = { mode: "api_key", apiKey: "k", apiSecret: "s" } as any;
  const CAP = 10000;

  function dateRangeFrom(paramsFilters: string | undefined): [string, string] | null {
    if (!paramsFilters) return null;
    const triples = JSON.parse(paramsFilters);
    const dateTriple = triples.find((t: any) => t[0] === "posting_date");
    return dateTriple ? dateTriple[2] : null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    callMethod.mockImplementation(async (_method: string, params: any) => {
      const [start, end] = dateRangeFrom(params.filters)!;
      if (start === "2024-01-01" && end === "2025-12-31") return CAP + 1;
      return 1; // both halves trivially under cap
    });
    getDocList.mockImplementation(async (_doctype: string, params: any) => {
      const [start] = dateRangeFrom(params.filters)!;
      // Same customer ("Acme") appears in BOTH halves — real-world shape:
      // one customer with invoices spanning both years.
      if (start === "2024-01-01") return [{ name: "H1", grand_total: 100, customer: "Acme" }];
      return [{ name: "H2", grand_total: 300, customer: "Acme" }, { name: "H3", grand_total: 50, customer: "Beta" }];
    });
  });

  it("combines the SAME group's partial totals across chunks instead of overwriting", async () => {
    const result = await connector.aggregate("sales_invoice", credential, {
      field: "total",
      op: "sum",
      groupBy: "customer",
      filters: { date: { op: "between", value: ["2024-01-01", "2025-12-31"] } },
    });
    const acme = result.groups!.find((g) => g.key === "Acme");
    const beta = result.groups!.find((g) => g.key === "Beta");
    expect(acme).toEqual({ key: "Acme", value: 400, count: 2 });
    expect(beta).toEqual({ key: "Beta", value: 50, count: 1 });
  });
});

describe("ErpNextConnector.list — default page size comes from settingsService, not a hardcoded 100", () => {
  const connector = new ErpNextConnector();
  const credential = { mode: "api_key", apiKey: "k", apiSecret: "s" } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    getDocList.mockResolvedValue([]);
  });

  it("uses the admin-configured default when the caller didn't pass an explicit limit", async () => {
    settingsService.get.mockResolvedValue(25);
    await connector.list("sales_invoice", credential, {});
    const [, params] = getDocList.mock.calls[0];
    expect(params.limit_page_length).toBe(25);
    expect(settingsService.get).toHaveBeenCalledWith("list_page_size", 25);
  });

  it("an explicit caller-supplied limit still wins over the default", async () => {
    settingsService.get.mockResolvedValue(25);
    await connector.list("sales_invoice", credential, { limit: 200 });
    const [, params] = getDocList.mock.calls[0];
    expect(params.limit_page_length).toBe(200);
  });
});
