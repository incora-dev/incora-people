import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accessPolicies, auditEvents } from "@/db/schema";
import {
  getAccessPolicy,
  getCurrentUser,
  hasRecentAuthentication,
  recentAuthenticationResponse,
} from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (user.role !== "super_admin" || !access.manageSettings) {
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  }
  if (!hasRecentAuthentication(user))
    return recentAuthenticationResponse("/settings");
  const { id } = await params;
  const policyId = Number(id);
  const body = (await request.json()) as Record<string, unknown>;
  const [current] = await getDb()
    .select()
    .from(accessPolicies)
    .where(eq(accessPolicies.id, policyId))
    .limit(1);
  if (!current)
    return Response.json({ error: "Access group not found." }, { status: 404 });
  if (current.role === "super_admin") {
    return Response.json(
      { error: "Super administrator permissions are protected." },
      { status: 409 },
    );
  }

  const values = {
    managePeople: Boolean(body.managePeople),
    viewSensitiveData: Boolean(body.viewSensitiveData),
    approveLeave: Boolean(body.approveLeave),
    approveTime: Boolean(body.approveTime),
    approveExpenses: Boolean(body.approveExpenses),
    viewAudit: Boolean(body.viewAudit),
    // Operational settings belong to HR and super administrators only. A
    // manager/employee must never gain this capability through the editable
    // matrix, even when a stale client submits manageSettings=true.
    manageSettings: current.role === "hr_admin",
    // Inventory write access is an explicit least-privilege grant. Only the
    // HR Admin role can receive it from this settings matrix.
    manageInventory:
      current.role === "hr_admin" && Boolean(body.manageInventory),
    updatedAt: new Date().toISOString(),
  };
  const [policy] = await getDb()
    .update(accessPolicies)
    .set(values)
    .where(eq(accessPolicies.id, policyId))
    .returning();
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "settings.access_policy_updated",
      entityType: "access_policy",
      entityId: String(policyId),
      details: `${current.label} permissions updated`,
    });
  return Response.json({ policy });
}
