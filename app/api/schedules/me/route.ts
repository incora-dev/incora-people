import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, workSchedules } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";
import { workScheduleSchema } from "@/modules/time/contracts";

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user.employeeId) {
    return Response.json(
      { error: "Your account is not linked to an employee." },
      { status: 403 },
    );
  }

  const parsed = await parseJsonRequest(request, workScheduleSchema);
  if (!parsed.ok) return parsed.response;
  const { startTime, endTime, workDays, timezone, breakMinutes } = parsed.data;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(workSchedules)
    .where(eq(workSchedules.employeeId, user.employeeId))
    .limit(1);

  const [schedule] = existing
    ? await db
        .update(workSchedules)
        .set({
          startTime,
          endTime,
          workDays,
          timezone,
          breakMinutes,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(workSchedules.id, existing.id))
        .returning()
    : await db
        .insert(workSchedules)
        .values({
          employeeId: user.employeeId,
          startTime,
          endTime,
          workDays,
          timezone,
          breakMinutes,
        })
        .returning();

  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: "schedule.updated",
    entityType: "work_schedule",
    entityId: String(schedule.id),
    details: `${workDays} · ${startTime}–${endTime}`,
  });

  return Response.json({ schedule });
}
