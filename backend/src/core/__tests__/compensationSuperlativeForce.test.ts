import { detectCompensationSuperlativePhrase, buildForcedCompensationListArgs } from "../compensationSuperlativeForce";

describe("compensationSuperlativeForce", () => {
  it("detectCompensationSuperlativePhrase returns null", () => {
    expect(detectCompensationSuperlativePhrase("who is the highest paid employee")).toBeNull();
  });

  it("buildForcedCompensationListArgs sorts by ctc", () => {
    expect(buildForcedCompensationListArgs("highest")).toEqual({ sortBy: "ctc", sortDir: "desc" });
    expect(buildForcedCompensationListArgs("lowest")).toEqual({ sortBy: "ctc", sortDir: "asc" });
  });
});
