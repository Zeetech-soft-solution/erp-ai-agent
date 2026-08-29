import { EntityConfig } from "../../../../core/types";

export const JOB_OFFER_ENTITY: EntityConfig = {
    entityKey: "job_offer",
    module: "hr",
    toolPrefix: "job_offer",
    canonicalFields: ["id", "job_applicant", "status", "offer_date", "designation"],
    fieldValues: { status: ["Awaiting Response", "Accepted", "Rejected", "Cancelled"] },
    linkFields: { job_applicant: "job_applicant" },
    createFields: ["job_applicant", "offer_date", "designation"],
    description: "An offer letter extended to a job applicant",
  };
