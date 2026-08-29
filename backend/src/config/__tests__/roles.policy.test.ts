import { StaticRolePolicyProvider } from "../roles.policy";

// New 2026-08-19: every real functional role now also gets the common
// inbox tools (communication.*, notification_log.*) appended — see
// roles.policy.ts's own doc comment above COMMON_INBOX_TOOLS for why
// this is safe to grant broadly (Notification Log's own real
// permission_query_conditions already scope to the calling user; a
// broad TOOL grant here is never a second data boundary).
describe("StaticRolePolicyProvider — common inbox tools appended to every real role", () => {
  const provider = new StaticRolePolicyProvider();
  const COMMON_INBOX_TOOLS = [
    "communication.list",
    "communication.get",
    "communication.reply",
    "notification_log.list",
    "notification_log.get",
    "notification_log.mark_read",
  ];

  it.each(["Sales User", "Purchase Manager", "HR User", "Accounts Manager", "Support Team", "Employee"])(
    "%s gets every common inbox tool",
    (role) => {
      const allowed = provider.resolveAllowedTools([role]);
      for (const tool of COMMON_INBOX_TOOLS) {
        expect(allowed).toContain(tool);
      }
    }
  );

  it("System Manager's '*' stays a plain wildcard — never gets the inbox tools appended as literal extra entries", () => {
    const allowed = provider.resolveAllowedTools(["System Manager"]);
    expect(allowed).toEqual(["*"]);
  });

  it("an unmapped/unknown role still grants nothing at all — the common-tools append never widens that fallback", () => {
    const allowed = provider.resolveAllowedTools(["Some Made Up Role"]);
    expect(allowed).toEqual([]);
  });
});
