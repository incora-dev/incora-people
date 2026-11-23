import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, users } from "@/db/schema";
import {
  getAccessPolicy,
  getCurrentUser,
  hasRecentAuthentication,
  isProtectedSuperAdminEmail,
  recentAuthenticationResponse,
  type Role,
} from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  if (
    actor.role !== "super_admin" ||
    !(await getAccessPolicy(actor)).manageSettings
  ) {
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  }
  if (!hasRecentAuthentication(actor))
    return recentAuthenticationResponse("/settings");
  const { id } = await params;
  const userId = Number(id);
  const body = (await request.json()) as Record<string, unknown>;
  const role = String(body.role) as Role;
  const requestedManageProjects = body.manageProjects;
  if (!["super_admin", "hr_admin", "manager", "employee"].includes(role)) {
    return Response.json({ error: "Unknown access group." }, { status: 400 });
  }
  const [account] = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account)
    return Response.json({ error: "User not found." }, { status: 404 });
  if (
    requestedManageProjects !== undefined &&
    typeof requestedManageProjects !== "boolean"
  ) {
    return Response.json(
      { error: "Project access must be a boolean." },
      { status: 400 },
    );
  }
  const manageProjects =
    typeof requestedManageProjects === "boolean"
      ? requestedManageProjects
      : account.manageProjects;
  if (
    (account.role === "super_admin" || role === "super_admin") &&
    actor.role !== "super_admin"
  ) {
    return Response.json(
      { error: "Only a super administrator can manage this access group." },
      { status: 403 },
    );
  }
  if (
    (await isProtectedSuperAdminEmail(account.email)) &&
    role !== "super_admin"
  ) {
    return Response.json(
      { error: "This protected super administrator cannot be demoted." },
      { status: 409 },
    );
  }
  if (
    account.email === actor.email &&
    role !== "super_admin" &&
    role !== "hr_admin"
  ) {
    return Response.json(
      { error: "You cannot remove your own administrator access." },
      { status: 409 },
    );
  }
  const [updated] = await getDb()
    .update(users)
    .set({ role, manageProjects })
    .where(eq(users.id, userId))
    .returning();
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: actor.email,
      action: "settings.user_role_updated",
      entityType: "user",
      entityId: String(userId),
      details: `${account.email}: ${account.role} → ${role}; projects: ${manageProjects}`,
    });
  return Response.json({ user: updated });
}
