import { and, eq, inArray, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { timesheetPeriods, workSchedules } from "@/db/schema";
import { getWorkspaceTimezone } from "@/modules/settings/system";
import {
  dateKeyInTimeZone,
  getMonthDateRange,
  isValidTimeZone,
  monthKeysForInterval,
} from "@/modules/shared/date";
import { monthFromTimestamp } from "@/modules/time/domain";

const TIMESHEET_LOCK_LEASE_MS = 5 * 60 * 1000;

export async function isTimesheetLocked(
  employeeId: number,
  timestampOrMonth: string,
) {
  const month = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(timestampOrMonth)
    ? timestampOrMonth
    : await getEmployeeMonthKey(employeeId, timestampOrMonth);
  if (!month) return false;
  const [period] = await getDb()
    .select({ id: timesheetPeriods.id })
    .from(timesheetPeriods)
    .where(
      and(
        eq(timesheetPeriods.employeeId, employeeId),
        eq(timesheetPeriods.month, month),
        sql`${timesheetPeriods.status} IN ('locking', 'locked', 'approved')`,
      ),
    )
    .limit(1);
  return Boolean(period);
}

/**
 * Return every employee-local reporting month touched by a half-open UTC
 * interval.  The end instant is excluded, so an entry ending exactly at
 * local midnight does not incorrectly lock the following month.
 */
export async function getEmployeeMonthKeysForInterval(
  employeeId: number,
  start: string,
  end: string | null,
) {
  return monthKeysForInterval(
    start,
    end,
    await getEmployeeTimezone(employeeId),
  );
}

export async function getEmployeeMonthKeysForIntervals(
  employeeId: number,
  intervals: Array<{ start: string; end: string | null }>,
) {
  const keys = new Set<string>();
  for (const interval of intervals) {
    for (const month of await getEmployeeMonthKeysForInterval(
      employeeId,
      interval.start,
      interval.end,
    )) {
      keys.add(month);
    }
  }
  return [...keys].sort();
}

/** Check a whole set of affected periods in one query. */
export async function hasLockedTimesheetPeriods(
  employeeId: number,
  months: string[],
) {
  if (!months.length) return false;
  const [period] = await getDb()
    .select({ id: timesheetPeriods.id })
    .from(timesheetPeriods)
    .where(
      and(
        eq(timesheetPeriods.employeeId, employeeId),
        inArray(timesheetPeriods.month, months),
        sql`${timesheetPeriods.status} IN ('locking', 'locked', 'approved')`,
      ),
    )
    .limit(1);
  return Boolean(period);
}

export async function hasLockedTimesheetForIntervals(
  employeeId: number,
  intervals: Array<{ start: string; end: string | null }>,
) {
  return hasLockedTimesheetPeriods(
    employeeId,
    await getEmployeeMonthKeysForIntervals(employeeId, intervals),
  );
}

/**
 * Reserve a period for locking. The intermediate `locking` state is visible
 * to all time mutation guards, but is never treated as a final locked period.
 * A unique token makes the later finalize operation belong to this request.
 */
export async function beginTimesheetPeriodLock(input: {
  employeeId: number;
  month: string;
  note: string;
  lockedByEmail: string;
  lockedAt: string;
}) {
  const monthRange = await getEmployeeMonthRange(input.employeeId, input.month);
  if (!monthRange) return null;
  const lockToken = crypto.randomUUID();
  const lockLeaseCutoff = new Date(
    Date.parse(input.lockedAt) - TIMESHEET_LOCK_LEASE_MS,
  ).toISOString();
  const statement = getD1()
    .prepare(
      `INSERT INTO timesheet_periods (
         employee_id, month, status, note, locked_by_email, locked_at,
         lock_token,
         snapshot_worked_minutes, snapshot_expected_minutes,
         snapshot_overtime_minutes, snapshot_captured_at
       ) SELECT ?, ?, 'locking', ?, ?, ?, ?, NULL, NULL, NULL, NULL
       WHERE NOT EXISTS (
       SELECT 1 FROM time_entries entry
         WHERE entry.employee_id=?
           AND entry.clock_out IS NULL
           AND entry.clock_in < ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM time_corrections correction
         WHERE correction.employee_id=?
           AND correction.status='pending'
           AND (
             (
               correction.requested_clock_in < ?
               AND correction.requested_clock_out > ?
             )
             OR EXISTS (
               SELECT 1 FROM time_entries source
               WHERE source.id=correction.time_entry_id
                 AND source.employee_id=correction.employee_id
                 AND source.clock_in < ?
                 AND (source.clock_out IS NULL OR source.clock_out > ?)
             )
           )
       )
       ON CONFLICT(employee_id, month) DO UPDATE SET
         status='locking',
         note=excluded.note,
         locked_by_email=excluded.locked_by_email,
         locked_at=excluded.locked_at,
         lock_token=excluded.lock_token,
         snapshot_worked_minutes=NULL,
         snapshot_expected_minutes=NULL,
         snapshot_overtime_minutes=NULL,
         snapshot_captured_at=NULL
       WHERE timesheet_periods.status <> 'locking'
          OR timesheet_periods.locked_at IS NULL
          OR timesheet_periods.locked_at < ?
       RETURNING id, lock_token`,
    )
    .bind(
      input.employeeId,
      input.month,
      input.note,
      input.lockedByEmail,
      input.lockedAt,
      lockToken,
      input.employeeId,
      monthRange.utcEnd,
      input.employeeId,
      monthRange.utcEnd,
      monthRange.utcStart,
      monthRange.utcEnd,
      monthRange.utcStart,
      lockLeaseCutoff,
    );
  const [result] = await getD1().batch([statement]);
  if (result.meta.changes !== 1) return null;
  const [period] = await getDb()
    .select()
    .from(timesheetPeriods)
    .where(
      and(
        eq(timesheetPeriods.employeeId, input.employeeId),
        eq(timesheetPeriods.month, input.month),
      ),
    )
    .limit(1);
  return period?.lockToken === lockToken ? { period, lockToken } : null;
}

/**
 * Atomically finalize a reserved lock. The snapshot, final status and audit
 * event are committed in one D1 batch and the token prevents an older request
 * from finalizing a newer lock for the same employee/month.
 */
export async function finalizeTimesheetPeriodLock(input: {
  employeeId: number;
  month: string;
  lockToken: string;
  status: "locked" | "approved";
  note: string;
  actorEmail: string;
  capturedAt: string;
  snapshot: {
    workedMinutes: number;
    expectedMinutes: number;
    overtimeMinutes: number;
  };
}) {
  const d1 = getD1();
  const results = await d1.batch([
    d1
      .prepare(
        `UPDATE timesheet_periods
         SET status=?,
             note=?,
             snapshot_worked_minutes=?,
             snapshot_expected_minutes=?,
             snapshot_overtime_minutes=?,
             snapshot_captured_at=?,
             updated_at=?,
             lock_token=NULL
         WHERE employee_id=? AND month=?
           AND status='locking'
           AND lock_token=?
         RETURNING id`,
      )
      .bind(
        input.status,
        input.note,
        input.snapshot.workedMinutes,
        input.snapshot.expectedMinutes,
        input.snapshot.overtimeMinutes,
        input.capturedAt,
        input.capturedAt,
        input.employeeId,
        input.month,
        input.lockToken,
      ),
    d1
      .prepare(
        `INSERT INTO audit_events
           (actor_email, action, entity_type, entity_id, details)
         SELECT ?, ?, 'timesheet_period', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM timesheet_periods
           WHERE employee_id=? AND month=?
             AND status=?
             AND lock_token IS NULL
             AND snapshot_captured_at=?
         )`,
      )
      .bind(
        input.actorEmail,
        input.status === "approved" ? "timesheet.approved" : "timesheet.locked",
        `${input.employeeId}:${input.month}`,
        `${input.month} finalized with immutable snapshot`,
        input.employeeId,
        input.month,
        input.status,
        input.capturedAt,
      ),
  ]);
  if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) {
    return null;
  }
  const [period] = await getDb()
    .select()
    .from(timesheetPeriods)
    .where(
      and(
        eq(timesheetPeriods.employeeId, input.employeeId),
        eq(timesheetPeriods.month, input.month),
      ),
    )
    .limit(1);
  return period ?? null;
}

/** Resolve a reporting month using the employee schedule timezone. */
export async function getEmployeeMonthRange(employeeId: number, month: string) {
  return getMonthDateRange(month, await getEmployeeTimezone(employeeId));
}

export async function getEmployeeTimezone(employeeId: number) {
  const [schedule] = await getDb()
    .select({ timezone: workSchedules.timezone })
    .from(workSchedules)
    .where(eq(workSchedules.employeeId, employeeId))
    .limit(1);
  const workspaceTimezone = await getWorkspaceTimezone().catch(
    () => "Europe/Kyiv",
  );
  const configured = schedule?.timezone?.trim() ?? "";
  if (isValidTimeZone(configured)) return configured;
  return isValidTimeZone(workspaceTimezone) ? workspaceTimezone : "Europe/Kyiv";
}

export async function getEmployeeMonthKey(
  employeeId: number,
  timestamp: string,
) {
  const timezone = await getEmployeeTimezone(employeeId);
  return (
    dateKeyInTimeZone(timestamp, timezone)?.slice(0, 7) ??
    monthFromTimestamp(timestamp)
  );
}

export function lockedTimesheetResponse() {
  return Response.json(
    {
      error:
        "This timesheet period is locked. Ask a manager or HR to reopen it.",
      code: "timesheet_period_locked",
    },
    { status: 409 },
  );
}
