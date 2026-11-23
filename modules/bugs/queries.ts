import { desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { bugReports, employees } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";

export function getBugReports() {
  return getDb()
    .select({
      id: bugReports.id,
      reporterEmail: bugReports.reporterEmail,
      employeeId: bugReports.employeeId,
      reporterFirstName: employees.firstName,
      reporterLastName: employees.lastName,
      description: bugReports.description,
      screenshotFileId: bugReports.screenshotFileId,
      status: bugReports.status,
      resolvedByEmail: bugReports.resolvedByEmail,
      resolvedAt: bugReports.resolvedAt,
      createdAt: bugReports.createdAt,
    })
    .from(bugReports)
    .leftJoin(employees, eq(bugReports.employeeId, employees.id))
    .orderBy(desc(bugReports.createdAt));
}

export function getUserBugReports(user: Pick<CurrentUser, "userId" | "email">) {
  const owner = user.userId
    ? or(
        eq(bugReports.reporterUserId, user.userId),
        eq(bugReports.reporterEmail, user.email),
      )
    : eq(bugReports.reporterEmail, user.email);
  return getDb()
    .select()
    .from(bugReports)
    .where(owner)
    .orderBy(desc(bugReports.createdAt));
}
