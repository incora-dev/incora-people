import { and, eq, sql, type SQL } from "drizzle-orm";
import { employees } from "@/db/schema";
import { employeeInvitedSql } from "@/modules/people/activation";

/** True when the employee was invited (or has already signed in). */
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

/** Selectable boolean form of employeeInvitedCondition. */
export function employeeInvitedField() {
  return employeeInvitedCondition().mapWith((value) => Boolean(value));
}
