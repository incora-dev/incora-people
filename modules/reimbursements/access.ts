import {
  hasOrganizationScope,
  type AccessPolicy,
  type CurrentUser,
} from "@/lib/auth";

/**
 * Expense approval is scoped to the organization for HR/super-admins and to
 * direct reports for managers. Keeping this in one policy function prevents
 * list, detail, web and mobile review endpoints from drifting apart.
 */
export function canReviewExpense(
  user: CurrentUser,
  access: Pick<AccessPolicy, "approveExpenses">,
  managerId: number | null | undefined,
) {
  if (!access.approveExpenses) return false;
  if (hasOrganizationScope(user)) return true;
  return (
    user.role === "manager" &&
    user.employeeId !== null &&
    user.employeeId === managerId
  );
}
