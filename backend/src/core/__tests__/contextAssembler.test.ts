import { ContextAssembler } from "../contextAssembler";
import { ContextChunk, ContextProvider, Session } from "../types";
import { appConfig } from "../../config/app.config";

function makeSession(): Session {
  return { sub: "user@example.in", erpnext_roles: [], allowed_tools: [], credential: { mode: "api_key" } };
}

function makeProvider(name: string, fetchImpl: ContextProvider["fetch"]): ContextProvider {
  return { name, fetch: fetchImpl };
}

describe("ContextAssembler.assemble", () => {
  it("flattens results from every provider into one array", async () => {
    const providerA = makeProvider("a", async () => [{ source: "session_cache", label: "l1", content: "from A" }]);
    const providerB = makeProvider("b", async () => [{ source: "vector", label: "l2", content: "from B" }]);
    const assembler = new ContextAssembler([providerA, providerB]);

    const chunks = await assembler.assemble(makeSession(), "hi");
    expect(chunks).toEqual([
      { source: "session_cache", label: "l1", content: "from A" },
      { source: "vector", label: "l2", content: "from B" },
    ]);
  });

  it("divides the total character budget evenly across providers", async () => {
    const seenBudgets: number[] = [];
    const provider = makeProvider("a", async (_s, _p, budget) => {
      seenBudgets.push(budget);
      return [];
    });
    const assembler = new ContextAssembler([provider, provider]);
    await assembler.assemble(makeSession(), "hi");

    const expectedPerProvider = Math.floor(appConfig.context.totalBudgetChars / 2);
    expect(seenBudgets).toEqual([expectedPerProvider, expectedPerProvider]);
  });

  it("never divides by zero when given an empty provider list", async () => {
    const assembler = new ContextAssembler([]);
    await expect(assembler.assemble(makeSession(), "hi")).resolves.toEqual([]);
  });

  it("swallows a single provider's rejection and still returns the others' chunks (one bad provider can't break every turn's context)", async () => {
    const healthy = makeProvider("healthy", async () => [{ source: "session_cache", label: "ok", content: "fine" }]);
    const broken = makeProvider("broken", async () => {
      throw new Error("provider exploded");
    });
    const assembler = new ContextAssembler([healthy, broken]);

    const chunks = await assembler.assemble(makeSession(), "hi");
    expect(chunks).toEqual([{ source: "session_cache", label: "ok", content: "fine" }]);
  });
});

describe("ContextAssembler.toPromptBlock", () => {
  it("returns an empty string for no chunks (so the caller can skip an empty system message)", () => {
    expect(ContextAssembler.toPromptBlock([])).toBe("");
  });

  it("formats each chunk as [source:label] content, one per line", () => {
    const chunks: ContextChunk[] = [
      { source: "session_cache", label: "recent_turn", content: "asked about quotations" },
      { source: "vector", label: "past_interaction", content: "converted QTN-001 last week" },
    ];
    expect(ContextAssembler.toPromptBlock(chunks)).toBe(
      "[session_cache:recent_turn] asked about quotations\n[vector:past_interaction] converted QTN-001 last week"
    );
  });
});
