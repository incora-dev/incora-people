import { and, asc, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { employees, peopleTasks } from "@/db/schema";
import type { AccessPolicy, CurrentUser } from "@/lib/auth";

export async function getTaskWorkspaceData(
  user: CurrentUser,
  access: AccessPolicy,
) {
  const db = getDb();
  const scope = access.managePeople
    ? undefined
    : user.role === "manager" && user.employeeId
      ? or(
          eq(peopleTasks.assigneeEmployeeId, user.employeeId),
          eq(employees.managerId, user.employeeId),
        )
      : user.employeeId
        ? eq(peopleTasks.assigneeEmployeeId, user.employeeId)
        : eq(peopleTasks.id, -1);

  const tasks = await db
    .select({
      id: peopleTasks.id,
      title: peopleTasks.title,
      description: peopleTasks.description,
      category: peopleTasks.category,
      assigneeEmployeeId: peopleTasks.assigneeEmployeeId,
      assigneeFirstName: employees.firstName,
      assigneeLastName: employees.lastName,
      dueDate: peopleTasks.dueDate,
      priority: sql<"low" | "medium" | "high">`${peopleTasks.priority}`,
      status: peopleTasks.status,
      createdByEmail: peopleTasks.createdByEmail,
      completedAt: peopleTasks.completedAt,
      createdAt: peopleTasks.createdAt,
    })
    .from(peopleTasks)
    .innerJoin(employees, eq(peopleTasks.assigneeEmployeeId, employees.id))
    .where(scope)
    .orderBy(asc(peopleTasks.status), asc(peopleTasks.dueDate), peopleTasks.id)
    .limit(1000);

  const assigneeScope =
    access.managePeople || !user.employeeId
      ? undefined
      : user.role === "manager"
        ? or(
            eq(employees.id, user.employeeId),
            eq(employees.managerId, user.employeeId),
          )
        : eq(employees.id, user.employeeId);
  const assignees = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      jobTitle: employees.jobTitle,
    })
    .from(employees)
    .where(
      assigneeScope
        ? and(eq(employees.status, "active"), assigneeScope)
        : eq(employees.status, "active"),
    )
    .orderBy(employees.firstName, employees.lastName);

  return {
    tasks,
    assignees,
    canCreate: access.managePeople || user.role === "manager",
  };
}
