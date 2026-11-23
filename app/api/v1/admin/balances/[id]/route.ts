import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, leaveBalances } from "@/db/schema";
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
  const balanceId = Number(id);
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const allowance = Math.max(0, Number(body.allowance));
  const adjustment = Number(body.adjustment);
  if (
    !Number.isInteger(balanceId) ||
    !Number.isFinite(allowance) ||
    !Number.isFinite(adjustment)
  )
    return Response.json(
      { error: "Enter valid balance values." },
      { status: 400 },
    );
  const [balance] = await getDb()
    .update(leaveBalances)
    .set({ allowance, adjustment, updatedAt: new Date().toISOString() })
    .where(eq(leaveBalances.id, balanceId))
    .returning();
  if (!balance)
    return Response.json({ error: "Balance not found." }, { status: 404 });
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: client.user.email,
      action: "settings.leave_balance_updated",
      entityType: "leave_balance",
      entityId: String(balanceId),
      details: `Allowance ${allowance}, adjustment ${adjustment} via mobile`,
    });
  return Response.json({ balance });
}
