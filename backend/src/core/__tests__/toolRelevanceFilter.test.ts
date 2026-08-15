import { narrowToolsForPrompt } from "../toolRelevanceFilter";
import { ToolDefinition } from "../types";

describe("narrowToolsForPrompt", () => {
  it("returns the tools unchanged", () => {
    const tools = [{ name: "quotation.list", module: "selling" }] as unknown as ToolDefinition[];
    expect(narrowToolsForPrompt(tools, "any prompt")).toBe(tools);
  });
});
