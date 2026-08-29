import { buildSystemPrompt, CORE_SYSTEM_PROMPT, THIN_CORE, MODULE_PROMPT_SECTIONS } from "../index";
import { AppIdentity } from "../types";

/**
 * The shipped distribution carries the system-prompt ASSEMBLY but not the
 * instruction text itself (every core/module section exports an empty
 * string — supply your own). These tests cover the assembly wiring that
 * remains: session context, module selection, and the public exports.
 */
const TENANT: AppIdentity = { name: "Test Company" };
const USER = "test@example.com";
const ROLES = ["Sales User", "System Manager"];

describe("buildSystemPrompt", () => {
  it("always appends the dynamic session context, last", () => {
    const result = buildSystemPrompt("Show me quotations", false, TENANT, USER, ROLES);
    const sections = result.split("\n\n");
    expect(sections[sections.length - 1]).toContain("CURRENT SESSION:");
    expect(result).toContain("Test Company");
    expect(result).toContain("test@example.com");
    expect(result).toContain("Today:");
  });

  it("handles an empty role list", () => {
    const result = buildSystemPrompt("Show me quotations", false, TENANT, USER, []);
    expect(result).toContain("Role(s): none");
  });

  it("returns a string for both canWrite values without throwing", () => {
    expect(typeof buildSystemPrompt("Create a sales order", true, TENANT, USER, ROLES)).toBe("string");
    expect(typeof buildSystemPrompt("Create a sales order", false, TENANT, USER, ROLES)).toBe("string");
  });

  it("exposes the thin core and full core as strings", () => {
    expect(typeof THIN_CORE).toBe("string");
    expect(typeof CORE_SYSTEM_PROMPT).toBe("string");
  });

  it("MODULE_PROMPT_SECTIONS keys match the real module list exactly (no fictional modules)", () => {
    const REAL_MODULES = ["selling", "buying", "accounting", "hr", "manufacturing", "support", "projects", "stock", "assets", "crm", "quality", "analytics"];
    expect(Object.keys(MODULE_PROMPT_SECTIONS).sort()).toEqual(REAL_MODULES.sort());
  });
});
