import { LEAVE_APPLICATION_RULES } from "./leave_application";
import { LEAVE_ALLOCATION_RULES } from "./leave_allocation";
import { EMPLOYEE_ADVANCE_RULES } from "./employee_advance";
import { EXPENSE_CLAIM_RULES } from "./expense_claim";
import { JOB_OPENING_RULES } from "./job_opening";
import { JOB_APPLICANT_RULES } from "./job_applicant";
import { INTERVIEW_RULES } from "./interview";
import { JOB_OFFER_RULES } from "./job_offer";
import { SHIFT_ASSIGNMENT_RULES } from "./shift_assignment";
import { TRAINING_EVENT_RULES } from "./training_event";
import { RuleSet } from "../../../../core/types";

export const HR_RULES: RuleSet[] = [
  LEAVE_APPLICATION_RULES,
  LEAVE_ALLOCATION_RULES,
  EMPLOYEE_ADVANCE_RULES,
  EXPENSE_CLAIM_RULES,
  JOB_OPENING_RULES,
  JOB_APPLICANT_RULES,
  INTERVIEW_RULES,
  JOB_OFFER_RULES,
  SHIFT_ASSIGNMENT_RULES,
  TRAINING_EVENT_RULES,
];
