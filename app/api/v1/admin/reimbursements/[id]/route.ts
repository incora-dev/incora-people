import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, reimbursementPolicies } from "@/db/schema";
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
  const policyId = Number(id);
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const perRequestLimit = Math.round(Number(body.perRequestLimit));
  const annualLimit = Math.round(Number(body.annualLimit));
  const maxRequestsPerYear = Math.round(Number(body.maxRequestsPerYear));
  if (
    !Number.isInteger(policyId) ||
    perRequestLimit <= 0 ||
    annualLimit < perRequestLimit ||
    maxRequestsPerYear <= 0
  )
    return Response.json(
      { error: "Check reimbursement limits." },
      { status: 400 },
    );
  const [policy] = await getDb()
    .update(reimbursementPolicies)
    .set({
      perRequestLimit,
      annualLimit,
      maxRequestsPerYear,
      requiresReceipt: Boolean(body.requiresReceipt),
      requiresApproval: Boolean(body.requiresApproval),
      enabled: Boolean(body.enabled),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(reimbursementPolicies.id, policyId))
    .returning();
  if (!policy)
    return Response.json({ error: "Policy not found." }, { status: 404 });
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: client.user.email,
      action: "settings.reimbursement_policy_updated",
      entityType: "reimbursement_policy",
      entityId: String(policyId),
      details: `Limits updated via mobile`,
    });
  return Response.json({ policy });
}
