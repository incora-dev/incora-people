import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, users } from "@/db/schema";
import {
  getAccessPolicy,
  getApiClientUser,
  hasRecentAuthentication,
  isProtectedSuperAdminEmail,
  recentAuthenticationResponse,
  type Role,
} from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  if (
    client.user.role !== "super_admin" ||
    !(await getAccessPolicy(client.user)).manageSettings
  )
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  if (!hasRecentAuthentication(client.user))
    return recentAuthenticationResponse("/settings");
  const { id } = await params;
  const userId = Number(id);
  const role = String(
    ((await request.json().catch(() => ({}))) as { role?: unknown }).role,
  ) as Role;
  if (
    !Number.isInteger(userId) ||
    !["super_admin", "hr_admin", "manager", "employee"].includes(role)
  )
    return Response.json(
      { error: "Invalid user or access group." },
      { status: 400 },
    );
  const [account] = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account)
    return Response.json({ error: "User not found." }, { status: 404 });
  if (
    (account.role === "super_admin" || role === "super_admin") &&
    client.user.role !== "super_admin"
  )
    return Response.json(
      { error: "Only a super administrator can manage this access group." },
      { status: 403 },
    );
  if (
    (await isProtectedSuperAdminEmail(account.email)) &&
    role !== "super_admin"
  )
    return Response.json(
      { error: "This protected super administrator cannot be demoted." },
      { status: 409 },
    );
  if (
    account.email === client.user.email &&
    !["super_admin", "hr_admin"].includes(role)
  )
    return Response.json(
      { error: "You cannot remove your own administrator access." },
      { status: 409 },
    );
  const [updated] = await getDb()
    .update(users)
    .set({ role })
    .where(eq(users.id, userId))
    .returning();
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: client.user.email,
      action: "settings.user_role_updated",
      entityType: "user",
      entityId: String(userId),
      details: `${account.email}: ${account.role} → ${role} via mobile`,
    });
  return Response.json({ user: updated });
}
