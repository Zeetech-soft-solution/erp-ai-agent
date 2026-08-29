import { EMPLOYEE_ENTITY } from "./employee";
import { LEAVE_APPLICATION_ENTITY } from "./leave_application";
import { ATTENDANCE_ENTITY } from "./attendance";
import { SALARY_SLIP_ENTITY } from "./salary_slip";
import { JOB_OPENING_ENTITY } from "./job_opening";
import { LEAVE_ALLOCATION_ENTITY } from "./leave_allocation";
import { SALARY_STRUCTURE_ENTITY } from "./salary_structure";
import { SALARY_STRUCTURE_ASSIGNMENT_ENTITY } from "./salary_structure_assignment";
import { PAYROLL_ENTRY_ENTITY } from "./payroll_entry";
import { EMPLOYEE_ADVANCE_ENTITY } from "./employee_advance";
import { JOB_APPLICANT_ENTITY } from "./job_applicant";
import { INTERVIEW_ENTITY } from "./interview";
import { JOB_OFFER_ENTITY } from "./job_offer";
import { APPRAISAL_CYCLE_ENTITY } from "./appraisal_cycle";
import { APPRAISAL_ENTITY } from "./appraisal";
import { SHIFT_TYPE_ENTITY } from "./shift_type";
import { SHIFT_ASSIGNMENT_ENTITY } from "./shift_assignment";
import { DEPARTMENT_ENTITY } from "./department";
import { DESIGNATION_ENTITY } from "./designation";
import { EXPENSE_CLAIM_ENTITY } from "./expense_claim";
import { TRAINING_EVENT_ENTITY } from "./training_event";
import { EntityConfig } from "../../../../core/types";

export const HR_ENTITIES: EntityConfig[] = [
  EMPLOYEE_ENTITY,
  LEAVE_APPLICATION_ENTITY,
  ATTENDANCE_ENTITY,
  SALARY_SLIP_ENTITY,
  JOB_OPENING_ENTITY,
  LEAVE_ALLOCATION_ENTITY,
  SALARY_STRUCTURE_ENTITY,
  SALARY_STRUCTURE_ASSIGNMENT_ENTITY,
  PAYROLL_ENTRY_ENTITY,
  EMPLOYEE_ADVANCE_ENTITY,
  JOB_APPLICANT_ENTITY,
  INTERVIEW_ENTITY,
  JOB_OFFER_ENTITY,
  APPRAISAL_CYCLE_ENTITY,
  APPRAISAL_ENTITY,
  SHIFT_TYPE_ENTITY,
  SHIFT_ASSIGNMENT_ENTITY,
  DEPARTMENT_ENTITY,
  DESIGNATION_ENTITY,
  EXPENSE_CLAIM_ENTITY,
  TRAINING_EVENT_ENTITY,
];
