import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { accessPolicies, employees, users } from "@/db/schema";

export type ApprovalKind = "leave" | "expenses" | "time";

const permissionByKind = {
  leave: accessPolicies.approveLeave,
  expenses: accessPolicies.approveExpenses,
  time: accessPolicies.approveTime,
} as const;

/**
 * Returns only people who can actually act on this employee's request:
 * HR administrators with the relevant permission and the employee's direct
 * manager when that manager's access group grants the same permission.
 */
export async function getApprovalRecipientEmails(
  employeeId: number,
  kind: ApprovalKind,
) {
  const db = getDb();
  const [employee] = await db
    .select({ managerId: employees.managerId, email: employees.email })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  const rows = await db
    .select({ email: users.email })
    .from(users)
    .innerJoin(accessPolicies, eq(users.role, accessPolicies.role))
    .where(
      and(
        eq(permissionByKind[kind], true),
        // Disabled accounts must not keep a request pending forever or
        // receive approval notifications they can no longer act on.
        eq(users.enabled, true),
        or(
          inArray(users.role, ["super_admin", "hr_admin"]),
          eq(users.employeeId, employee?.managerId ?? -1),
        ),
      ),
    );

  const requesterEmail = employee?.email?.trim().toLowerCase();
  return [
    ...new Set(
      rows
        .map(({ email }) => email.toLowerCase())
        .filter((email) => email !== requesterEmail),
    ),
  ];
}
