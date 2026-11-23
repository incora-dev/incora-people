import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, employees, peopleTasks } from "@/db/schema";
import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { updateTaskSchema } from "@/modules/tasks/contracts";
import { parseJsonRequest } from "@/modules/shared/http";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Invalid task id." }, { status: 400 });
  }
  const parsed = await parseJsonRequest(request, updateTaskSchema);
  if (!parsed.ok) return parsed.response;

  const user = clientUser.user;
  const access = await getAccessPolicy(user);
  const db = getDb();
  const [task] = await db
    .select({
      id: peopleTasks.id,
      assigneeEmployeeId: peopleTasks.assigneeEmployeeId,
      managerId: employees.managerId,
    })
    .from(peopleTasks)
    .innerJoin(employees, eq(peopleTasks.assigneeEmployeeId, employees.id))
    .where(eq(peopleTasks.id, id))
    .limit(1);
  if (!task)
    return Response.json({ error: "Task not found." }, { status: 404 });
  const canUpdate =
    access.managePeople ||
    task.assigneeEmployeeId === user.employeeId ||
    (user.role === "manager" && task.managerId === user.employeeId);
  if (!canUpdate) {
    return Response.json(
      { error: "This task is outside your scope." },
      { status: 403 },
    );
  }

  const [updated] = await db
    .update(peopleTasks)
    .set({
      status: parsed.data.status,
      completedAt:
        parsed.data.status === "done" ? new Date().toISOString() : null,
    })
    .where(eq(peopleTasks.id, id))
    .returning();
  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: `task.${parsed.data.status}`,
    entityType: "people_task",
    entityId: String(id),
    details: `Updated via ${clientUser.clientType}`,
  });
  return Response.json({ task: updated });
}
