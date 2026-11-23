import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents,
  employees,
  timeCorrections,
  timeEntries,
  timesheetPeriods,
} from "@/db/schema";
import {
  getAccessPolicy,
  getCurrentUser,
  hasOrganizationScope,
} from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";
import { updateTimesheetPeriodSchema } from "@/modules/time/contracts";
import { getTimePeriodSnapshot } from "@/modules/time/queries";
import {
  beginTimesheetPeriodLock,
  finalizeTimesheetPeriodLock,
  getEmployeeMonthRange,
} from "@/modules/time/periods";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ employeeId: string }> },
) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.approveTime) {
    return Response.json(
      { error: "Time approval access required." },
      { status: 403 },
    );
  }
  const employeeId = Number((await context.params).employeeId);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return Response.json({ error: "Invalid employee id." }, { status: 400 });
  }
  const parsed = await parseJsonRequest(request, updateTimesheetPeriodSchema);
  if (!parsed.ok) return parsed.response;

  const db = getDb();
  const [employee] = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      managerId: employees.managerId,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!employee) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }
  const monthRange = await getEmployeeMonthRange(employeeId, parsed.data.month);
  if (!monthRange)
    return Response.json(
      { error: "Invalid timesheet month." },
      { status: 400 },
    );
  if (!hasOrganizationScope(user) && employee.managerId !== user.employeeId) {
    return Response.json(
      { error: "Managers may close direct reports only." },
      { status: 403 },
    );
  }

  if (parsed.data.status === "locked" || parsed.data.status === "approved") {
    const [[openEntry], [pendingCorrection]] = await Promise.all([
      db
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.employeeId, employeeId),
            lt(timeEntries.clockIn, monthRange.utcEnd),
            isNull(timeEntries.clockOut),
          ),
        )
        .limit(1),
      db
        .select({ id: timeCorrections.id })
        .from(timeCorrections)
        .leftJoin(timeEntries, eq(timeCorrections.timeEntryId, timeEntries.id))
        .where(
          and(
            eq(timeCorrections.employeeId, employeeId),
            eq(timeCorrections.status, "pending"),
            or(
              and(
                lt(timeCorrections.requestedClockIn, monthRange.utcEnd),
                gt(timeCorrections.requestedClockOut, monthRange.utcStart),
              ),
              and(
                lt(timeEntries.clockIn, monthRange.utcEnd),
                or(
                  isNull(timeEntries.clockOut),
                  gt(timeEntries.clockOut, monthRange.utcStart),
                ),
              ),
            ),
          ),
        )
        .limit(1),
    ]);
    if (openEntry || pendingCorrection) {
      return Response.json(
        {
          error: openEntry
            ? "Stop the running timer before locking this period."
            : "Review pending corrections before locking this period.",
        },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  const locked = ["locked", "approved"].includes(parsed.data.status);
  let period;
  if (locked) {
    const reservation = await beginTimesheetPeriodLock({
      employeeId,
      month: parsed.data.month,
      note: parsed.data.note,
      lockedByEmail: user.email,
      lockedAt: now,
    });
    if (!reservation) {
      return Response.json(
        {
          error:
            "The period changed while it was being locked. Stop active work and review pending corrections, then retry.",
        },
        { status: 409 },
      );
    }
    const snapshot = await getTimePeriodSnapshot(employeeId, parsed.data.month);
    period = await finalizeTimesheetPeriodLock({
      employeeId,
      month: parsed.data.month,
      lockToken: reservation.lockToken,
      status: parsed.data.status as "locked" | "approved",
      note: parsed.data.note,
      actorEmail: user.email,
      capturedAt: now,
      snapshot: {
        workedMinutes: snapshot?.workedMinutes ?? 0,
        expectedMinutes: snapshot?.expectedMinutes ?? 0,
        overtimeMinutes: snapshot?.overtimeMinutes ?? 0,
      },
    });
    if (!period) {
      return Response.json(
        { error: "The timesheet lock changed before it could be finalized." },
        { status: 409 },
      );
    }
  } else {
    [period] = await db
      .insert(timesheetPeriods)
      .values({
        employeeId,
        month: parsed.data.month,
        status: parsed.data.status,
        note: parsed.data.note,
        lockedByEmail: null,
        lockedAt: null,
        snapshotWorkedMinutes: null,
        snapshotExpectedMinutes: null,
        snapshotOvertimeMinutes: null,
        snapshotCapturedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [timesheetPeriods.employeeId, timesheetPeriods.month],
        set: {
          status: parsed.data.status,
          note: parsed.data.note,
          lockedByEmail: null,
          lockedAt: null,
          snapshotWorkedMinutes: null,
          snapshotExpectedMinutes: null,
          snapshotOvertimeMinutes: null,
          snapshotCapturedAt: null,
          updatedAt: now,
        },
      })
      .returning();
  }

  if (!locked) {
    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action:
        parsed.data.status === "revision_required"
          ? "timesheet.revision_required"
          : "timesheet.opened",
      entityType: "timesheet_period",
      entityId: `${employeeId}:${parsed.data.month}`,
      details: `${employee.firstName} ${employee.lastName} · ${parsed.data.month}`,
    });
  }

  return Response.json({ period });
}
