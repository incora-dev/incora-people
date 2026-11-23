import { z } from "zod";

export const deleteErroneousEmployeeSchema = z.object({
  requestId: z.string().uuid(),
  confirmationName: z.string().trim().min(1).max(240),
  confirmsErroneousTestRecord: z.literal(true),
});

export type EmployeeDeletionForeignKey = {
  parent: string;
  table: string;
  column: string;
};

export type EmployeeDeletionReferenceDisposition =
  | "employee-account-link"
  | "initial-history-cleanup"
  | "unused-leave-balance-cleanup"
  | "routine-profile-metadata-cleanup"
  | "preview-session-cleanup"
  | "account-session-cleanup"
  | "blocked";

/**
 * Only generated session artifacts, the pristine registration history, unused
 * leave balances, and skill metadata are cleanup-safe. Every other FK blocks.
 */
export function classifyEmployeeDeletionReference(
  reference: EmployeeDeletionForeignKey,
): EmployeeDeletionReferenceDisposition {
  const key = `${reference.parent}.${reference.table}.${reference.column}`;
  const allowed: Record<string, EmployeeDeletionReferenceDisposition> = {
    "employees.users.employee_id": "employee-account-link",
    "employees.employment_history.employee_id": "initial-history-cleanup",
    "employees.leave_balances.employee_id": "unused-leave-balance-cleanup",
    "employees.employee_profile_records.employee_id":
      "routine-profile-metadata-cleanup",
    "employees.employee_view_previews.target_employee_id":
      "preview-session-cleanup",
    "users.employee_view_previews.target_user_id": "preview-session-cleanup",
    "users.web_sessions.user_id": "account-session-cleanup",
    "users.client_sessions.user_id": "account-session-cleanup",
    "users.oauth_authorization_codes.user_id": "account-session-cleanup",
    "users.mobile_push_tokens.user_id": "account-session-cleanup",
    "users.notifications.user_id": "account-session-cleanup",
  };
  return allowed[key] ?? "blocked";
}

export function employeeDeletionReferenceCategory(
  reference: EmployeeDeletionForeignKey,
) {
  const table = reference.table;
  if (table.includes("compensation") || table.includes("payroll")) {
    return "Compensation or payroll history";
  }
  if (table === "employment_history" || table === "employee_terminations") {
    return "Employment or termination history";
  }
  if (table.startsWith("leave_")) return "Leave records";
  if (table.startsWith("reimbursement_")) return "Expense records";
  if (table.startsWith("one_on_one_")) return "1:1 records";
  if (table.includes("document") || table === "stored_files") {
    return "Retained documents or files";
  }
  if (table.includes("asset")) return "Asset records";
  if (
    table.includes("time") ||
    table.includes("timesheet") ||
    table.includes("schedule")
  ) {
    return "Timekeeping records";
  }
  if (table === "employees" && reference.column === "manager_id") {
    return "Manager or reporting relationships";
  }
  if (table === "employee_profile_records") {
    return "Employee profile records";
  }
  if (table === "notification_outbox") {
    return "Pending notification records";
  }
  if (reference.parent === "users") return "Account-linked records";
  return "Other linked business records";
}

export type EmployeeDeletionCandidate = {
  actorUserId: number | null;
  targetUserId: number | null;
  targetRole: string | null;
  targetStatus: string;
  accountMatchesEmployee: boolean;
  protectedIdentity: boolean;
  pristineInitialHistory: boolean;
  onlyUnusedGeneratedLeaveBalances: boolean;
  blockedReferenceCount: number;
  confirmationName: string;
  employeeName: string;
  confirmsErroneousTestRecord: boolean;
};

export type EmployeeDeletionBlocker =
  | "self"
  | "protected"
  | "employee_only"
  | "identity_mismatch"
  | "employment_history"
  | "leave_history"
  | "linked_records"
  | "confirmation";

export function employeeDeletionBlocker(
  candidate: EmployeeDeletionCandidate,
): EmployeeDeletionBlocker | null {
  if (
    candidate.actorUserId !== null &&
    candidate.actorUserId === candidate.targetUserId
  ) {
    return "self";
  }
  if (candidate.protectedIdentity || candidate.targetRole === "super_admin") {
    return "protected";
  }
  if (
    candidate.targetRole !== "employee" ||
    candidate.targetStatus !== "active"
  ) {
    return "employee_only";
  }
  if (!candidate.targetUserId || !candidate.accountMatchesEmployee) {
    return "identity_mismatch";
  }
  if (!candidate.pristineInitialHistory) return "employment_history";
  if (!candidate.onlyUnusedGeneratedLeaveBalances) return "leave_history";
  if (candidate.blockedReferenceCount > 0) return "linked_records";
  if (
    !isEmployeeDeletionConfirmed(
      candidate.confirmationName,
      candidate.employeeName,
      candidate.confirmsErroneousTestRecord,
    )
  ) {
    return "confirmation";
  }
  return null;
}

export function employeeDeletionError(blocker: EmployeeDeletionBlocker) {
  const messages: Record<EmployeeDeletionBlocker, string> = {
    self: "You cannot delete your own account.",
    protected: "Protected administrator identities cannot be deleted.",
    employee_only:
      "Only an active ordinary employee record can be permanently deleted.",
    identity_mismatch:
      "The employee and account relationship is missing or ambiguous.",
    employment_history:
      "This employee has missing, changed, or additional employment history and cannot be permanently deleted.",
    leave_history:
      "This employee has used or adjusted leave records and cannot be permanently deleted.",
    linked_records:
      "This employee has linked HR, financial, document, asset, or shared business records and cannot be permanently deleted.",
    confirmation:
      "Confirm that this is an erroneous or test employee and type the employee name exactly.",
  };
  return messages[blocker];
}

export function isEmployeeDeletionConfirmed(
  confirmationName: string,
  employeeName: string,
  attested: boolean,
) {
  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase("uk-UA");
  const entered = confirmationName.trim();
  return (
    attested &&
    entered.length > 0 &&
    entered.length <= 240 &&
    normalize(entered) === normalize(employeeName)
  );
}
