export const COMPENSATION_SUPERLATIVE_TOOL = "salary_structure_assignment.list";

export function detectCompensationSuperlativePhrase(_message: string): "highest" | "lowest" | null {
  return null;
}

export function buildForcedCompensationListArgs(direction: "highest" | "lowest"): { sortBy: string; sortDir: "asc" | "desc" } {
  return { sortBy: "ctc", sortDir: direction === "highest" ? "desc" : "asc" };
}

export const COMPENSATION_SUPERLATIVE_FORCED_HINT = "";
