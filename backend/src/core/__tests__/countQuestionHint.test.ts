import {
  detectCountQuestionPhrase,
  detectDashboardQuestionPhrase,
  detectRateQuestionPhrase,
  detectGroupingQuestionPhrase,
  detectCorrelationQuestionPhrase,
} from "../countQuestionHint";

describe("countQuestionHint detectors", () => {
  it("always return false", () => {
    expect(detectCountQuestionPhrase("how many leads")).toBe(false);
    expect(detectDashboardQuestionPhrase("show me a dashboard")).toBe(false);
    expect(detectRateQuestionPhrase("what's the pass rate")).toBe(false);
    expect(detectGroupingQuestionPhrase("top customer")).toBe(false);
    expect(detectCorrelationQuestionPhrase("is there a correlation")).toBe(false);
  });
});
