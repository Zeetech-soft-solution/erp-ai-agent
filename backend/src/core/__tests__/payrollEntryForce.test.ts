import {
  detectPayrollEntryPhrase,
  buildForcedPayrollEntryListArgs,
  PAYROLL_ENTRY_TOOL,
  PAYROLL_ENTRY_FORCED_HINT,
} from "../payrollEntryForce";

// Confirmed live 2026-08-16: "List Payroll_entry" (typed exactly as the
// raw entity name) and "List payroll entries" — same prompt, same
// session, immediate retry — got "I don't have access to the
// payroll_entry.list tool" once and real data the very next try, despite
// the tool genuinely being in that session's real tool list both times
// (verified independently via a direct connector call). This detector is
// what lets reasoningEngine.ts force the right tool call server-side
// before that gap can even open up, same move as
// compensationSuperlativeForce.ts.
describe("detectPayrollEntryPhrase", () => {
  it("detects the exact confirmed-live failing phrasing", () => {
    expect(detectPayrollEntryPhrase("List Payroll_entry")).toBe(true);
    expect(detectPayrollEntryPhrase("List payroll entries")).toBe(true);
  });

  it("detects other lookup-verb + payroll phrasing", () => {
    expect(detectPayrollEntryPhrase("Show me this month's payroll")).toBe(true);
    expect(detectPayrollEntryPhrase("How many payroll runs have we done?")).toBe(true);
    expect(detectPayrollEntryPhrase("What payroll entries are still Draft?")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(detectPayrollEntryPhrase("LIST PAYROLL entries")).toBe(true);
  });

  it("does not fire on payroll mentioned with no lookup verb", () => {
    expect(detectPayrollEntryPhrase("payroll")).toBe(false);
  });

  it("does not fire on a plain compensation question with no mention of payroll runs", () => {
    // This is compensationSuperlativeForce.ts's territory, not this one's.
    expect(detectPayrollEntryPhrase("Who is our highest paid employee?")).toBe(false);
    expect(detectPayrollEntryPhrase("What is Vikram's salary?")).toBe(false);
  });

  it("names the real entity this deployment's payroll-run data lives on", () => {
    expect(PAYROLL_ENTRY_TOOL).toBe("payroll_entry.list");
  });
});

describe("buildForcedPayrollEntryListArgs", () => {
  it("sorts newest run first with a reasonable page size", () => {
    expect(buildForcedPayrollEntryListArgs()).toEqual({ sortBy: "end_date", sortDir: "desc", limit: 100 });
  });
});

describe("PAYROLL_ENTRY_FORCED_HINT", () => {
  it("names the real tool and tells the model not to re-call it or deny access", () => {
    expect(PAYROLL_ENTRY_FORCED_HINT).toContain(PAYROLL_ENTRY_TOOL);
    expect(PAYROLL_ENTRY_FORCED_HINT).toMatch(/do not claim you lack access/i);
  });
});
