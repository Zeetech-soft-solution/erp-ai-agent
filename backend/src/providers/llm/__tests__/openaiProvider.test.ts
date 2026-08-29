import { parseRetryAfterMs } from "../openaiProvider";

describe("parseRetryAfterMs", () => {
  it("parses a seconds phrasing", () => {
    expect(parseRetryAfterMs("Rate limit reached. Please try again in 2.641s.")).toBe(2641);
  });

  it("parses a milliseconds phrasing", () => {
    expect(parseRetryAfterMs("Please try again in 500ms")).toBe(500);
  });

  it("returns null when there is no wait time in the message", () => {
    expect(parseRetryAfterMs("Some other 429 shape")).toBeNull();
  });
});
