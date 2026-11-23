import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, timeProjects } from "@/db/schema";
import { canManageProjects, getCurrentUser } from "@/lib/auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!(await canManageProjects(user))) {
    return Response.json(
      { error: "Project manager access required." },
      { status: 403 },
    );
  }
  const id = Number((await context.params).id);
  const body = (await request.json().catch(() => null)) as {
    active?: unknown;
  } | null;
  if (!Number.isInteger(id) || id <= 0 || typeof body?.active !== "boolean") {
    return Response.json({ error: "Invalid project update." }, { status: 400 });
  }
  const db = getDb();
  const [project] = await db
    .update(timeProjects)
    .set({ active: body.active })
    .where(eq(timeProjects.id, id))
    .returning();
  if (!project)
    return Response.json({ error: "Project not found." }, { status: 404 });
  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: "update",
    entityType: "time_project",
    entityId: String(id),
    details: body.active ? "Activated" : "Archived",
  });
  return Response.json({ project });
}
