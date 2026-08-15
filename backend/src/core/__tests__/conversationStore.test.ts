import { conversationStore, titleFromPrompt } from "../conversationStore";

describe("titleFromPrompt", () => {
  it("returns short prompts unchanged", () => {
    expect(titleFromPrompt("hello")).toBe("hello");
  });

  it("truncates long prompts on a word boundary", () => {
    const long = "a".repeat(80);
    expect(titleFromPrompt(long).length).toBeLessThanOrEqual(61);
  });
});

describe("conversationStore", () => {
  it("listRecent returns an empty array", async () => {
    await expect(conversationStore.listRecent("user@example.com", 3)).resolves.toEqual([]);
  });

  it("belongsToUser returns false", async () => {
    await expect(conversationStore.belongsToUser("id", "user@example.com")).resolves.toBe(false);
  });
});
