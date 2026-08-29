import { EntityConfig } from "../../../../core/types";

export const JOB_APPLICANT_ENTITY: EntityConfig = {
    entityKey: "job_applicant",
    module: "hr",
    toolPrefix: "job_applicant",
    canonicalFields: ["id", "applicant_name", "email", "phone", "job_title", "designation", "status"],
    fieldValues: { status: ["Open", "Replied", "Shortlisted", "Rejected", "Hold", "Accepted"] },
    // Confirmed live 2026-08-17: "how many applicants per job opening"
    // filtered on a guessed field name "job_opening" (the obvious, natural
    // guess) 11 times in a row — every single one silently rejected
    // ("job_opening is not a real filter field") — because ERPNext's own
    // real field for this link is confusingly named "job_title" (Link to
    // Job Opening, despite the name), not "job_opening". The model never
    // tried the real field name, gave up, and told the user "no applicants
    // have applied to any of them yet" — a false conclusion from a filter
    // gap, not a real fact. Same fix pattern as every other linkFields
    // entry in this codebase: name the trap explicitly so the tool's own
    // description tells the model the real field before it has to guess.
    linkFields: { job_title: "job_opening" },
    createFields: ["applicant_name", "email", "job_title"],
    description: "A candidate who applied for a job opening — despite the confusing ERPNext field name, \"job_title\" IS the link to the Job Opening this application is for, not a free-text title",
  };
