import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accessPolicies, auditEvents } from "@/db/schema";
import {
  getAccessPolicy,
  getApiClientUser,
  hasRecentAuthentication,
  recentAuthenticationResponse,
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
  const policyId = Number(id);
  const [current] = await getDb()
    .select()
    .from(accessPolicies)
    .where(eq(accessPolicies.id, policyId))
    .limit(1);
  if (!current)
    return Response.json({ error: "Access group not found." }, { status: 404 });
  if (current.role === "super_admin")
    return Response.json(
      { error: "Super administrator permissions are protected." },
      { status: 409 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const values = {
    managePeople: Boolean(body.managePeople),
    viewSensitiveData: Boolean(body.viewSensitiveData),
    approveLeave: Boolean(body.approveLeave),
    approveTime: Boolean(body.approveTime),
    approveExpenses: Boolean(body.approveExpenses),
    viewAudit: Boolean(body.viewAudit),
    manageSettings: current.role === "hr_admin",
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
      actorEmail: client.user.email,
      action: "settings.access_policy_updated",
      entityType: "access_policy",
      entityId: String(policyId),
      details: `${current.label} permissions updated via mobile`,
    });
  return Response.json({ policy });
}
