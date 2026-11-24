import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { employees } from "@/db/schema";
import { employeeInvitedSql } from "@/modules/people/activation";

/** True when the employee was invited, or has a Super Admin account that cannot be invited. */
export function employeeInvitedCondition(): SQL {
  return sql`${sql.raw(employeeInvitedSql('"employees"."id"'))}`;
}

/**
 * An active employee is employed (status 'active') and has been invited to the
 * system. A person who was added but not invited is never active. Use it for
 * queries that read the `employees` table without an alias.
 */
export function activeEmployeeCondition(): SQL {
  return and(eq(employees.status, "active"), employeeInvitedCondition())!;
}

/**
 * An invited employee who is still employed, including one on leave. Use it
 * for company-wide announcements that people on leave should still receive.
 */
export function employedInvitedEmployeeCondition(): SQL {
  return and(
    inArray(employees.status, ["active", "on_leave"]),
    employeeInvitedCondition(),
  )!;
}

/** Selectable boolean form of employeeInvitedCondition. */
export function employeeInvitedField() {
  return employeeInvitedCondition().mapWith((value) => Boolean(value));
}
