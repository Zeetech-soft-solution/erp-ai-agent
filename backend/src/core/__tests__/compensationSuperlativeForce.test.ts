import {
  detectCompensationSuperlativePhrase,
  buildForcedCompensationListArgs,
  COMPENSATION_SUPERLATIVE_TOOL,
  COMPENSATION_SUPERLATIVE_FORCED_HINT,
} from "../compensationSuperlativeForce";

// Confirmed live 2026-08-13: "who is our highest paid employee?" fetched
// real salary_structure_assignment.ctc data and correctStatedSuperlative
// fixed the model's wrong prose against it — but confirmed live on a
// repeat test that the model doesn't reliably call that tool at all; it
// sometimes calls analytics.aggregate against "employee" (no comp fields
// there) instead, and fabricates with nothing real to correct against.
// This detector is what lets reasoningEngine.ts force the right tool call
// server-side before that gap can even open up.
describe("detectCompensationSuperlativePhrase", () => {
  it("detects a highest-paid question", () => {
    expect(detectCompensationSuperlativePhrase("Who is our highest paid employee?")).toBe("highest");
  });

  it("detects a lowest-salary question", () => {
    expect(detectCompensationSuperlativePhrase("Who has the lowest salary?")).toBe("lowest");
  });

  it("detects other compensation phrasing: package, ctc, wages, compensation", () => {
    expect(detectCompensationSuperlativePhrase("What's the top salary package we pay?")).toBe("highest");
    expect(detectCompensationSuperlativePhrase("Show me the employee with the highest ctc")).toBe("highest");
    expect(detectCompensationSuperlativePhrase("Who earns the smallest wages here?")).toBe("lowest");
    expect(detectCompensationSuperlativePhrase("Who has the least compensation?")).toBe("lowest");
  });

  it("does not fire on a superlative question with no compensation keyword", () => {
    expect(detectCompensationSuperlativePhrase("Which customer has the highest outstanding amount?")).toBeNull();
    expect(detectCompensationSuperlativePhrase("What's our most expensive item?")).toBeNull();
  });

  it("does not fire on a compensation question with no superlative", () => {
    expect(detectCompensationSuperlativePhrase("What is Vikram's salary?")).toBeNull();
    expect(detectCompensationSuperlativePhrase("List everyone's ctc.")).toBeNull();
  });

  it("does not fire when both highest and lowest appear (ambiguous)", () => {
    expect(detectCompensationSuperlativePhrase("What's the range between highest and lowest paid?")).toBeNull();
  });

  it("names the real entity this deployment's compensation data lives on", () => {
    expect(COMPENSATION_SUPERLATIVE_TOOL).toBe("salary_structure_assignment.list");
  });
});

describe("buildForcedCompensationListArgs", () => {
  it("sorts descending by ctc for a highest question, with its own explicit bounded limit", () => {
    expect(buildForcedCompensationListArgs("highest")).toEqual({ sortBy: "ctc", sortDir: "desc", limit: 5 });
  });

  it("sorts ascending by ctc for a lowest question, with its own explicit bounded limit", () => {
    expect(buildForcedCompensationListArgs("lowest")).toEqual({ sortBy: "ctc", sortDir: "asc", limit: 5 });
  });
});

describe("COMPENSATION_SUPERLATIVE_FORCED_HINT", () => {
  it("names the real tool and warns off the known-wrong path", () => {
    expect(COMPENSATION_SUPERLATIVE_FORCED_HINT).toContain(COMPENSATION_SUPERLATIVE_TOOL);
    expect(COMPENSATION_SUPERLATIVE_FORCED_HINT).toMatch(/analytics\.aggregate/);
    expect(COMPENSATION_SUPERLATIVE_FORCED_HINT).toMatch(/no salary\/ctc\/net_pay field/);
  });
});
