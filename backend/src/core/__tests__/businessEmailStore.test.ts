import { businessEmailStore } from "../businessEmailStore";

describe("businessEmailStore", () => {
  it("list returns an empty array", async () => {
    await expect(businessEmailStore.list("user@example.com", "email")).resolves.toEqual([]);
  });

  it("insertTestSend rejects", async () => {
    await expect(
      businessEmailStore.insertTestSend({ fromEmail: "a@b.com", fromName: "A", toEmail: "c@d.com", subject: "s", body: "b" })
    ).rejects.toThrow();
  });
});
