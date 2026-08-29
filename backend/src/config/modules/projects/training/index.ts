import { ModuleTrainingConfig } from "../../../../core/types";

/**
 * Projects training curation metadata.
 */
export const PROJECTS_TRAINING: ModuleTrainingConfig = {
  module: "projects",
  pseudonymizeFields: ["customer"],
  retentionDays: 365,
  notes: "Project/task patterns have lasting analytical value; strip linked customer identity before any fine-tuning export.",
};
