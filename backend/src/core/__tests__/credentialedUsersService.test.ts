import { listCredentialedUsers } from "../credentialedUsersService";

describe("listCredentialedUsers", () => {
  it("returns an empty array", async () => {
    await expect(listCredentialedUsers()).resolves.toEqual([]);
  });
});
