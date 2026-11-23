import { and, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  breakEntries,
  employees,
  timeCorrections,
  timeEntries,
} from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";
import { reviewTimeCorrectionSchema } from "@/modules/time/contracts";
import { parseTimeInterval } from "@/modules/time/domain";
import {
  getEmployeeMonthKeysForIntervals,
  hasLockedTimesheetPeriods,
  lockedTimesheetResponse,
} from "@/modules/time/periods";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.approveTime) {
    return Response.json(
      { error: "Manager access required." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const correctionId = Number(id);
  const parsed = await parseJsonRequest(request, reviewTimeCorrectionSchema);
  if (!parsed.ok) return parsed.response;
  const { decision, note } = parsed.data;
  if (!Number.isInteger(correctionId)) {
    return Response.json({ error: "Invalid review request." }, { status: 400 });
  }

  const db = getDb();
  const [correction] = await db
    .select()
    .from(timeCorrections)
    .where(eq(timeCorrections.id, correctionId))
    .limit(1);
  if (!correction || correction.status !== "pending") {
    return Response.json(
      { error: "Pending correction not found." },
      { status: 404 },
    );
  }

  if (user.role === "manager") {
    const [employee] = await db
      .select({ managerId: employees.managerId })
      .from(employees)
      .where(eq(employees.id, correction.employeeId))
      .limit(1);
    if (!employee || employee.managerId !== user.employeeId) {
      return Response.json(
        { error: "Managers may review direct reports only." },
        { status: 403 },
      );
    }
  }

  let affectedMonths: string[] = [];
  let currentEntry:
    { id: number; clockIn: string; clockOut: string | null } | undefined;
  if (decision === "approved" && correction.timeEntryId) {
    [currentEntry] = await db
      .select({
        id: timeEntries.id,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
      })
      .from(timeEntries)
      .where(eq(timeEntries.id, correction.timeEntryId))
      .limit(1);
    if (!currentEntry) {
      return Response.json(
        { error: "The time entry for this correction no longer exists." },
        { status: 409 },
      );
    }
    affectedMonths = await getEmployeeMonthKeysForIntervals(
      correction.employeeId,
      [
        { start: currentEntry.clockIn, end: currentEntry.clockOut },
        {
          start: correction.requestedClockIn,
          end: correction.requestedClockOut,
        },
      ],
    );
    if (await hasLockedTimesheetPeriods(correction.employeeId, affectedMonths))
      return lockedTimesheetResponse();
    const interval = parseTimeInterval(
      correction.requestedClockIn,
      correction.requestedClockOut,
    );
    if (!interval) {
      return Response.json(
        { error: "The requested time interval is invalid." },
        { status: 409 },
      );
    }
    const [outsideBreak] = await db
      .select({ id: breakEntries.id })
      .from(breakEntries)
      .where(
        and(
          eq(breakEntries.timeEntryId, correction.timeEntryId),
          or(
            lt(breakEntries.startedAt, correction.requestedClockIn),
            isNull(breakEntries.endedAt),
            gt(breakEntries.endedAt, correction.requestedClockOut),
          ),
        ),
      )
      .limit(1);
    if (outsideBreak) {
      return Response.json(
        { error: "This correction would exclude an existing break." },
        { status: 409 },
      );
    }
    const [overlap] = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.employeeId, correction.employeeId),
          ne(timeEntries.id, correction.timeEntryId),
          lt(timeEntries.clockIn, interval.end.toISOString()),
          or(
            isNull(timeEntries.clockOut),
            gt(timeEntries.clockOut, interval.start.toISOString()),
          ),
        ),
      )
      .limit(1);
    if (overlap) {
      return Response.json(
        { error: "This correction would overlap another time entry." },
        { status: 409 },
      );
    }
  }

  const reviewedAt = new Date().toISOString();
  const d1 = getD1();
  const statements = [];
  if (decision === "approved" && correction.timeEntryId && currentEntry) {
    const monthPlaceholders = affectedMonths.map(() => "?").join(", ");
    statements.push(
      d1
        .prepare(
          `UPDATE time_entries
           SET clock_in=?, clock_out=?
           WHERE id=?
             AND EXISTS (
               SELECT 1 FROM time_corrections
               WHERE id=? AND status='pending'
             )
             AND NOT EXISTS (
               SELECT 1 FROM timesheet_periods
               WHERE employee_id=?
                 AND status IN ('locking', 'locked', 'approved')
                 AND month IN (${monthPlaceholders})
             )
             AND NOT EXISTS (
               SELECT 1 FROM time_entries existing
               WHERE existing.id<>?
                 AND existing.employee_id=?
                 AND existing.clock_in < ?
                 AND (existing.clock_out IS NULL OR existing.clock_out > ?)
             )
           RETURNING id`,
        )
        .bind(
          correction.requestedClockIn,
          correction.requestedClockOut,
          correction.timeEntryId,
          correctionId,
          correction.employeeId,
          ...affectedMonths,
          correction.timeEntryId,
          correction.employeeId,
          correction.requestedClockOut,
          correction.requestedClockIn,
        ),
    );
    statements.push(
      d1
        .prepare(
          `UPDATE time_corrections
           SET status=?, reviewer_email=?, reviewer_note=?, reviewed_at=?
           WHERE id=? AND status='pending'
             AND EXISTS (
               SELECT 1 FROM time_entries
               WHERE id=? AND clock_in=? AND clock_out=?
             )`,
        )
        .bind(
          decision,
          user.email,
          note,
          reviewedAt,
          correctionId,
          correction.timeEntryId,
          correction.requestedClockIn,
          correction.requestedClockOut,
        ),
    );
  } else {
    statements.push(
      d1
        .prepare(
          "UPDATE time_corrections SET status = ?, reviewer_email = ?, reviewer_note = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'",
        )
        .bind(decision, user.email, note, reviewedAt, correctionId),
    );
  }
  statements.push(
    d1
      .prepare(
        "INSERT INTO audit_events(actor_email, action, entity_type, entity_id, details) SELECT ?, ?, 'time_correction', ?, ? WHERE EXISTS (SELECT 1 FROM time_corrections WHERE id=? AND status=? AND reviewed_at=?)",
      )
      .bind(
        user.email,
        `time.correction_${decision}`,
        String(correctionId),
        `${decision} correction request`,
        correctionId,
        decision,
        reviewedAt,
      ),
  );
  let batchResult;
  try {
    batchResult = await getD1().batch(statements);
  } catch (error) {
    if (
      String(error).includes("time_entry_overlap") ||
      String(error).includes("time_entry_break_outside_interval")
    ) {
      return Response.json(
        {
          error: String(error).includes("time_entry_break_outside_interval")
            ? "This correction would exclude an existing break."
            : "This correction would overlap another time entry.",
        },
        { status: 409 },
      );
    }
    throw error;
  }
  const reviewResult =
    decision === "approved" && correction.timeEntryId && currentEntry
      ? batchResult[1]
      : batchResult[0];
  if (reviewResult.meta.changes !== 1) {
    if (decision === "approved") {
      if (
        await hasLockedTimesheetPeriods(correction.employeeId, affectedMonths)
      )
        return lockedTimesheetResponse();
      return Response.json(
        { error: "This correction conflicts with another time entry." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "This correction was already reviewed." },
      { status: 409 },
    );
  }

  const [reviewed] = await db
    .select()
    .from(timeCorrections)
    .where(eq(timeCorrections.id, correctionId))
    .limit(1);

  return Response.json({ correction: reviewed });
}
