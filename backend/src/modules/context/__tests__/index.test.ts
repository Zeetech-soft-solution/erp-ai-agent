import { contextModule } from "../index";
import { vectorContextProvider } from "../../../providers/context/vectorContextProvider";
import { Session } from "../../../core/types";

jest.mock("../../../providers/context/vectorContextProvider", () => ({
  vectorContextProvider: { fetch: jest.fn() },
}));

const session = { sub: "u@x.com", credential: {} } as unknown as Session;

function tool(name: string) {
  const t = contextModule.tools.find((t) => t.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
}

describe("contextModule", () => {
  beforeEach(() => jest.clearAllMocks());

  it("registers context.search and context.lookup", () => {
    expect(contextModule.tools.map((t) => t.name).sort()).toEqual(["context.lookup", "context.search"]);
  });

  it("context.search fetches with the query and a 4000-char budget", async () => {
    (vectorContextProvider.fetch as jest.Mock).mockResolvedValue("cold-tier result");
    const result = await tool("context.search").handler({ query: "overdue invoices" }, session);
    expect(vectorContextProvider.fetch).toHaveBeenCalledWith(session, "overdue invoices", 4000);
    expect(result).toBe("cold-tier result");
  });

  it("context.lookup fetches by label with the same 4000-char budget", async () => {
    (vectorContextProvider.fetch as jest.Mock).mockResolvedValue("entity detail");
    const result = await tool("context.lookup").handler({ label: "SAL-QTN-2026-00014" }, session);
    expect(vectorContextProvider.fetch).toHaveBeenCalledWith(session, "SAL-QTN-2026-00014", 4000);
    expect(result).toBe("entity detail");
  });
});
