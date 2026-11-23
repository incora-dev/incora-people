import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, leaveBalances, leaveTypes } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getDateContext } from "@/modules/shared/date";

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
  const typeId = Number(id);
  const body = (await request.json()) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const color = typeof body.color === "string" ? body.color.trim() : "";
  const defaultAllowance = Math.max(0, Number(body.defaultAllowance));
  if (
    !name ||
    !/^#[0-9a-f]{6}$/i.test(color) ||
    !Number.isFinite(defaultAllowance)
  ) {
    return Response.json(
      { error: "Enter a valid policy name, color and allowance." },
      { status: 400 },
    );
  }
  const [policy] = await getDb()
    .update(leaveTypes)
    .set({
      name,
      color,
      defaultAllowance,
      requiresApproval: Boolean(body.requiresApproval),
    })
    .where(eq(leaveTypes.id, typeId))
    .returning();
  if (!policy)
    return Response.json({ error: "Leave policy not found." }, { status: 404 });

  if (body.applyToExisting === true) {
    const { year } = getDateContext();
    await getDb()
      .update(leaveBalances)
      .set({ allowance: defaultAllowance, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(leaveBalances.leaveTypeId, typeId),
          eq(leaveBalances.year, year),
        ),
      );
  }
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "settings.leave_policy_updated",
      entityType: "leave_type",
      entityId: String(typeId),
      details: `${name}: ${defaultAllowance} default days`,
    });
  return Response.json({ policy });
}
