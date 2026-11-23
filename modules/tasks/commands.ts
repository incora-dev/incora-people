import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { employees, peopleTasks } from "@/db/schema";
import type { AccessPolicy, CurrentUser } from "@/lib/auth";
import {
  buildInAppNotificationStatements,
  buildPushNotificationStatements,
} from "@/modules/notifications/outbox";
import { createTaskSchema } from "@/modules/tasks/contracts";
import { z } from "zod";

type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Create a task and all of its local side effects in one D1 batch. The route
 * adapters (web and mobile) share this command so they cannot drift in
 * notification, audit, or scope behaviour.
 */
export async function createTask(
  user: CurrentUser,
  access: AccessPolicy,
  input: CreateTaskInput,
) {
  if (!access.managePeople && user.role !== "manager") {
    throw new TaskCommandError("Manager or HR access required.", 403);
  }
  const db = getDb();
  const [assignee] = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      managerId: employees.managerId,
    })
    .from(employees)
    .where(eq(employees.id, input.assigneeEmployeeId))
    .limit(1);
  if (
    !assignee ||
    (!access.managePeople &&
      assignee.id !== user.employeeId &&
      assignee.managerId !== user.employeeId)
  ) {
    throw new TaskCommandError(
      "This employee is outside your task scope.",
      403,
    );
  }

  const dueDate = input.dueDate || null;
  const now = new Date().toISOString();
  const eventKey = crypto.randomUUID();
  const message = `${input.title}${dueDate ? ` · ${dueDate}` : ""}`;
  const d1 = getD1();
  const statements = [
    d1
      .prepare(
        `INSERT INTO people_tasks
           (title, description, category, assignee_employee_id, due_date,
            priority, status, created_by_email, completed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, NULL, ?) RETURNING id`,
      )
      .bind(
        input.title,
        input.description,
        input.category,
        input.assigneeEmployeeId,
        dueDate,
        input.priority,
        user.email,
        now,
      ),
    d1
      .prepare(
        `INSERT INTO audit_events
           (actor_email, action, entity_type, entity_id, details)
         VALUES (?, 'task.created', 'people_task', CAST(last_insert_rowid() AS TEXT), ?)`,
      )
      .bind(user.email, `${input.category}: ${input.title}`),
  ];
  if (assignee.email !== user.email) {
    const notification = {
      title: "New task",
      body: message,
      href: "/tasks",
    };
    statements.push(
      ...buildInAppNotificationStatements(d1, [assignee.email], notification),
      ...buildPushNotificationStatements(
        d1,
        [assignee.email],
        notification,
        `task.created:${eventKey}`,
      ),
    );
  }

  const results = await d1.batch(statements);
  const taskId = Number(
    (results[0]?.results?.[0] as { id?: number } | undefined)?.id ?? 0,
  );
  if (!taskId) throw new Error("Task was not persisted.");
  const [task] = await db
    .select()
    .from(peopleTasks)
    .where(eq(peopleTasks.id, taskId))
    .limit(1);
  if (!task) throw new Error("Task was not persisted.");
  return {
    task: {
      ...task,
      assigneeFirstName: assignee.firstName,
      assigneeLastName: assignee.lastName,
    },
  };
}

export class TaskCommandError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
