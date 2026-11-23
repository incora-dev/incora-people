import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, reimbursementPolicies } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings) {
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  }
  const { id } = await params;
  const policyId = Number(id);
  const body = (await request.json()) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const currency =
    typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const perRequestLimit = Math.round(Number(body.perRequestLimit) * 100);
  const annualLimit = Math.round(Number(body.annualLimit) * 100);
  const maxRequestsPerYear = Math.round(Number(body.maxRequestsPerYear));
  if (
    !name ||
    !["UAH", "USD", "EUR"].includes(currency) ||
    perRequestLimit <= 0 ||
    annualLimit < perRequestLimit ||
    maxRequestsPerYear <= 0
  ) {
    return Response.json(
      { error: "Check the policy name, currency, limits and request count." },
      { status: 400 },
    );
  }
  const [policy] = await getDb()
    .update(reimbursementPolicies)
    .set({
      name,
      currency,
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
      actorEmail: user.email,
      action: "settings.reimbursement_policy_updated",
      entityType: "reimbursement_policy",
      entityId: String(policyId),
      details: `${name}: ${maxRequestsPerYear} requests, ${annualLimit / 100} ${currency} annual limit`,
    });
  return Response.json({ policy });
}
