import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, leaveTypes } from "@/db/schema";
import { getAccessPolicy, getApiClientUser } from "@/lib/auth";

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
  if (!(await getAccessPolicy(client.user)).manageSettings)
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  const { id } = await params;
  const typeId = Number(id);
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const defaultAllowance = Math.max(0, Number(body.defaultAllowance));
  if (!Number.isInteger(typeId) || !Number.isFinite(defaultAllowance))
    return Response.json(
      { error: "Enter a valid allowance." },
      { status: 400 },
    );
  const [policy] = await getDb()
    .update(leaveTypes)
    .set({
      defaultAllowance,
      requiresApproval: Boolean(body.requiresApproval),
    })
    .where(eq(leaveTypes.id, typeId))
    .returning();
  if (!policy)
    return Response.json({ error: "Leave policy not found." }, { status: 404 });
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: client.user.email,
      action: "settings.leave_policy_updated",
      entityType: "leave_type",
      entityId: String(typeId),
      details: `${policy.name}: ${defaultAllowance} days via mobile`,
    });
  return Response.json({ policy });
}
