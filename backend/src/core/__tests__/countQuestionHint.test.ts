import {
  detectCountQuestionPhrase,
  detectDashboardQuestionPhrase,
  detectRateQuestionPhrase,
  detectGroupingQuestionPhrase,
  detectCorrelationQuestionPhrase,
} from "../countQuestionHint";

describe("countQuestionHint detectors", () => {
  it("recognize their own real trigger phrases", () => {
    expect(detectCountQuestionPhrase("how many leads")).toBe(true);
    expect(detectDashboardQuestionPhrase("show me a dashboard")).toBe(true);
    expect(detectRateQuestionPhrase("what's the pass rate")).toBe(true);
    expect(detectGroupingQuestionPhrase("top customer")).toBe(true);
    expect(detectCorrelationQuestionPhrase("is there a correlation")).toBe(true);
  });

  it("don't fire on unrelated text", () => {
    expect(detectCountQuestionPhrase("hello")).toBe(false);
    expect(detectDashboardQuestionPhrase("hello")).toBe(false);
    expect(detectRateQuestionPhrase("hello")).toBe(false);
    expect(detectGroupingQuestionPhrase("hello")).toBe(false);
    expect(detectCorrelationQuestionPhrase("hello")).toBe(false);
  });
});
