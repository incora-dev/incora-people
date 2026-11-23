import { getDb } from "@/db";
import { auditEvents, timeProjects } from "@/db/schema";
import { canManageProjects, getCurrentUser } from "@/lib/auth";
import { timeProjectSchema } from "@/modules/time/contracts";
import { parseJsonRequest } from "@/modules/shared/http";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!(await canManageProjects(user))) {
    return Response.json(
      { error: "Project manager access required." },
      { status: 403 },
    );
  }
  const parsed = await parseJsonRequest(request, timeProjectSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const db = getDb();
    const [project] = await db
      .insert(timeProjects)
      .values(parsed.data)
      .returning();
    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "create",
      entityType: "time_project",
      entityId: String(project.id),
      details: `${project.code} · ${project.name}`,
    });
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return Response.json(
      {
        error: message.includes("UNIQUE")
          ? "Project code already exists."
          : "Could not create project.",
      },
      { status: message.includes("UNIQUE") ? 409 : 500 },
    );
  }
}
