import { EntityConfig } from "../../../../core/types";

export const INTERVIEW_ENTITY: EntityConfig = {
    entityKey: "interview",
    module: "hr",
    toolPrefix: "interview",
    canonicalFields: ["id", "interview_type", "job_applicant", "job_opening", "designation", "status", "scheduled_on"],
    fieldValues: { status: ["Pending", "Under Review", "Cleared", "Rejected", "Cancelled"] },
    linkFields: { job_applicant: "job_applicant", job_opening: "job_opening" },
    createFields: ["interview_type", "job_applicant", "scheduled_on", "from_time", "to_time"],
    description: "A scheduled interview round for a job applicant",
  };
