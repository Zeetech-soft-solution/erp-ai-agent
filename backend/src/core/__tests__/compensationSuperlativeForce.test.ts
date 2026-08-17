import { detectCompensationSuperlativePhrase, buildForcedCompensationListArgs } from "../compensationSuperlativeForce";

// Note: this detector/arg-builder pair is pure, correctly-behaving code
// (same as pro's) but isn't currently wired into reasoningEngine.ts in
// this tier — salary_structure_assignment isn't an exposed entity here,
// so there's no forced pre-fetch to seed. Kept testable/correct anyway
// in case a future HR module wires it back in.
describe("compensationSuperlativeForce", () => {
  it("detectCompensationSuperlativePhrase recognizes a real compensation-ranking question", () => {
    expect(detectCompensationSuperlativePhrase("who is the highest paid employee")).toBe("highest");
    expect(detectCompensationSuperlativePhrase("who has the lowest salary")).toBe("lowest");
    expect(detectCompensationSuperlativePhrase("hello")).toBeNull();
  });

  it("buildForcedCompensationListArgs sorts by ctc with its own explicit bounded limit", () => {
    expect(buildForcedCompensationListArgs("highest")).toEqual({ sortBy: "ctc", sortDir: "desc", limit: 5 });
    expect(buildForcedCompensationListArgs("lowest")).toEqual({ sortBy: "ctc", sortDir: "asc", limit: 5 });
  });
});
