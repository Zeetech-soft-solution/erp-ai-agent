import { analyticsModule } from "../index";

describe("analyticsModule", () => {
  it("registers under the analytics module name", () => {
    expect(analyticsModule.name).toBe("analytics");
  });

  it("exposes no tools", () => {
    expect(analyticsModule.tools).toEqual([]);
  });
});
