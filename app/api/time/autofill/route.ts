import { and, eq, gte, gt, isNull, lt, lte, or } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  breakEntries,
  companyHolidays,
  leaveRequests,
  timeEntries,
  workSchedules,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  getDayDateRange,
  getDateContext,
  isValidTimeZone,
  isoWeekday,
  zonedDateTimeToUtc,
} from "@/modules/shared/date";
import { parseJsonRequest } from "@/modules/shared/http";
import { parseTimeInterval } from "@/modules/time/domain";
import { autofillTimeEntrySchema } from "@/modules/time/contracts";
import {
  isTimesheetLocked,
  lockedTimesheetResponse,
} from "@/modules/time/periods";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user.employeeId) {
    return Response.json(
      { error: "Your account is not linked to an employee." },
      { status: 403 },
    );
  }
  const parsed = await parseJsonRequest(request, autofillTimeEntrySchema);
  if (!parsed.ok) return parsed.response;

  const db = getDb();
  const [schedule] = await db
    .select()
    .from(workSchedules)
    .where(eq(workSchedules.employeeId, user.employeeId))
    .limit(1);
  if (!schedule) {
    return Response.json(
      { error: "Set your work schedule before autofilling a day." },
      { status: 400 },
    );
  }

  const timezone = schedule.timezone.trim();
  if (!isValidTimeZone(timezone)) {
    return Response.json(
      { error: "Your work schedule contains an invalid timezone." },
      { status: 400 },
    );
  }
  const date = getDateContext(new Date(), timezone);
  const dayRange = getDayDateRange(date.today, timezone);
  if (!dayRange) {
    return Response.json(
      { error: "Your work schedule contains an invalid timezone." },
      { status: 400 },
    );
  }
  if (await isTimesheetLocked(user.employeeId, date.monthKey)) {
    return lockedTimesheetResponse();
  }

  const [[existing], [holiday], [leave]] = await Promise.all([
    db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.employeeId, user.employeeId),
          lt(timeEntries.clockIn, dayRange.utcEnd),
          or(
            isNull(timeEntries.clockOut),
            gt(timeEntries.clockOut, dayRange.utcStart),
          ),
        ),
      )
      .limit(1),
    db
      .select({ id: companyHolidays.id })
      .from(companyHolidays)
      .where(eq(companyHolidays.date, date.today))
      .limit(1),
    db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, user.employeeId),
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, date.today),
          gte(leaveRequests.endDate, date.today),
        ),
      )
      .limit(1),
  ]);
  if (existing) {
    return Response.json(
      { error: "Today already has a time entry." },
      { status: 409 },
    );
  }
  if (holiday || leave) {
    return Response.json(
      { error: "Time cannot be autofilled on leave or a company holiday." },
      { status: 400 },
    );
  }
  const weekday = isoWeekday(new Date(`${date.today}T12:00:00Z`).getUTCDay());
  if (!schedule.workDays.split(",").map(Number).includes(weekday)) {
    return Response.json(
      { error: "Today is not part of your work schedule." },
      { status: 400 },
    );
  }

  const start = zonedDateTimeToUtc(date.today, schedule.startTime, timezone);
  const end = zonedDateTimeToUtc(date.today, schedule.endTime, timezone);
  const interval =
    start && end
      ? parseTimeInterval(start.toISOString(), end.toISOString())
      : null;
  if (!interval) {
    return Response.json(
      { error: "Your work schedule contains an invalid interval." },
      { status: 400 },
    );
  }
  const startIso = interval.start.toISOString();
  const endIso = interval.end.toISOString();
  const grossMinutes = Math.round(
    (interval.end.getTime() - interval.start.getTime()) / 60000,
  );
  const breakMinutes = Math.min(
    Math.max(0, schedule.breakMinutes),
    Math.max(0, grossMinutes - 1),
  );
  const breakStart = new Date(
    interval.start.getTime() +
      Math.floor((grossMinutes - breakMinutes) / 2) * 60000,
  ).toISOString();
  const breakEnd = new Date(
    new Date(breakStart).getTime() + breakMinutes * 60000,
  ).toISOString();

  try {
    const d1 = getD1();
    const statements = [
      d1
        .prepare(
          `INSERT INTO time_entries
             (employee_id, clock_in, clock_out, source, note)
           SELECT ?, ?, ?, 'autofill', ?
           WHERE NOT EXISTS (
             SELECT 1 FROM timesheet_periods
             WHERE employee_id=?
               AND month=?
               AND status IN ('locking', 'locked', 'approved')
           )
           RETURNING id`,
        )
        .bind(
          user.employeeId,
          startIso,
          endIso,
          "Standard workday",
          user.employeeId,
          date.monthKey,
        ),
    ];
    if (breakMinutes > 0) {
      statements.push(
        d1
          .prepare(
            `INSERT INTO break_entries(time_entry_id, started_at, ended_at)
             SELECT id, ?, ? FROM time_entries
             WHERE employee_id=? AND clock_in=? AND clock_out=? LIMIT 1`,
          )
          .bind(breakStart, breakEnd, user.employeeId, startIso, endIso),
      );
    }
    statements.push(
      d1
        .prepare(
          `INSERT INTO audit_events
             (actor_email, action, entity_type, entity_id, details)
           SELECT ?, 'time.autofill', 'time_entry', CAST(id AS TEXT),
             'Standard workday added with scheduled break'
           FROM time_entries
           WHERE employee_id=? AND clock_in=? AND clock_out=? LIMIT 1`,
        )
        .bind(user.email, user.employeeId, startIso, endIso),
    );
    const results = await d1.batch(statements);
    const entryId = Number(
      (results[0]?.results?.[0] as { id?: number } | undefined)?.id ?? 0,
    );
    if (!entryId) {
      if (await isTimesheetLocked(user.employeeId, date.monthKey))
        return lockedTimesheetResponse();
      return Response.json(
        { error: "Time entry state changed. Refresh and retry." },
        { status: 409 },
      );
    }
    const [entry] = entryId
      ? await db
          .select()
          .from(timeEntries)
          .where(eq(timeEntries.id, entryId))
          .limit(1)
      : [];
    if (!entry) {
      return Response.json(
        { error: "Time entry was not persisted." },
        { status: 500 },
      );
    }
    const [scheduledBreak] = await db
      .select()
      .from(breakEntries)
      .where(eq(breakEntries.timeEntryId, entry.id))
      .limit(1);
    return Response.json(
      { entry, break: scheduledBreak ?? null },
      { status: 201 },
    );
  } catch (error) {
    if (String(error).includes("time_entry_overlap")) {
      return Response.json(
        { error: "Today already has a time entry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
