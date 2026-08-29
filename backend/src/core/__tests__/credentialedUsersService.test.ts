// The module under test caches its result process-wide (see
// credentialedUsersService.ts's module-scoped `cache`), so each test needs
// a fresh module instance — jest.resetModules() + a dynamic require per
// test, rather than one top-level import shared (and silently cached)
// across every `it()` below.
jest.mock("../../erpnext/client", () => ({
  getDocList: jest.fn(),
}));

describe("credentialedUsersService", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function load() {
    const client = require("../../erpnext/client");
    const service = require("../credentialedUsersService");
    return { mockGetDocList: client.getDocList as jest.Mock, listCredentialedUsers: service.listCredentialedUsers };
  }

  it("maps Employee rows with a real user_id into email/name/department/designation, sorted by name", async () => {
    const { mockGetDocList, listCredentialedUsers } = load();
    mockGetDocList.mockResolvedValueOnce([
      { employee_name: "Zoya Khan", department: "Sales", designation: "Executive", user_id: "zoya@example.in" },
      { employee_name: "Amit Rao", department: "Purchase", designation: "Manager", user_id: "amit@example.in" },
    ]);

    const users = await listCredentialedUsers();

    expect(users).toEqual([
      { email: "amit@example.in", name: "Amit Rao", department: "Purchase", designation: "Manager" },
      { email: "zoya@example.in", name: "Zoya Khan", department: "Sales", designation: "Executive" },
    ]);
  });

  it("drops rows with no real user_id (unlinked Employee records)", async () => {
    const { mockGetDocList, listCredentialedUsers } = load();
    mockGetDocList.mockResolvedValueOnce([
      { employee_name: "No Login", department: "Production", designation: "Engineer", user_id: "" },
      { employee_name: "Has Login", department: "IT", designation: "Analyst", user_id: "has@example.in" },
    ]);

    const users = await listCredentialedUsers();

    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("has@example.in");
  });

  it("queries the Employee doctype filtered to real user_id, unpaginated, via the privileged client", async () => {
    const { mockGetDocList, listCredentialedUsers } = load();
    mockGetDocList.mockResolvedValueOnce([]);

    await listCredentialedUsers();

    expect(mockGetDocList).toHaveBeenCalledWith("Employee", {
      filters: JSON.stringify([["user_id", "!=", ""]]),
      fields: JSON.stringify(["employee_name", "department", "designation", "user_id"]),
      limit_page_length: 0,
    });
  });

  it("caches results across calls within the TTL, without a second fetch", async () => {
    const { mockGetDocList, listCredentialedUsers } = load();
    mockGetDocList.mockResolvedValueOnce([
      { employee_name: "Cached Person", department: "HR", designation: "Officer", user_id: "cached@example.in" },
    ]);

    const first = await listCredentialedUsers();
    const second = await listCredentialedUsers();

    expect(second).toEqual(first);
    expect(mockGetDocList).toHaveBeenCalledTimes(1);
  });
});
