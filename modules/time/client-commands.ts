import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  breakEntries,
  employees,
  timeEntries,
  timeProjects,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { isUniqueConstraintError } from "@/modules/shared/database-errors";
import { getDayDateRange, getDateContext } from "@/modules/shared/date";
import { clippedDurationMinutes } from "@/modules/time/domain";
import {
  getEmployeeMonthKey,
  getEmployeeMonthKeysForIntervals,
  getEmployeeTimezone,
  hasLockedTimesheetPeriods,
  isTimesheetLocked,
} from "@/modules/time/periods";

export type ClientTimeSource = "chrome_extension" | "mobile" | "web";

export async function getClientTimeStatus(user: CurrentUser) {
  if (!user.employeeId) {
    return {
      active: false,
      linked: false,
      entry: null,
      openBreak: null,
      workedMinutesToday: 0,
    };
  }
  const db = getDb();
  const [entry] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.employeeId, user.employeeId),
        isNull(timeEntries.clockOut),
      ),
    )
    .orderBy(desc(timeEntries.clockIn))
    .limit(1);
  const [openBreak] = entry
    ? await db
        .select()
        .from(breakEntries)
        .where(
          and(
            eq(breakEntries.timeEntryId, entry.id),
            isNull(breakEntries.endedAt),
          ),
        )
        .limit(1)
    : [];
  const workedMinutesToday = await getWorkedMinutesToday(user.employeeId, db);
  return {
    active: Boolean(entry),
    linked: true,
    entry: entry ?? null,
    openBreak: openBreak ?? null,
    workedMinutesToday,
  };
}

async function getWorkedMinutesToday(
  employeeId: number,
  db: ReturnType<typeof getDb>,
) {
  const now = new Date();
  const timeZone = await getEmployeeTimezone(employeeId);
  const { today } = getDateContext(now, timeZone);
  const dayRange = getDayDateRange(today, timeZone);
  if (!dayRange) return 0;
  const nowIso = now.toISOString();
  const effectiveRange = {
    utcStart: dayRange.utcStart,
    utcEnd:
      new Date(dayRange.utcEnd).getTime() < now.getTime()
        ? dayRange.utcEnd
        : nowIso,
  };
  const startIso = dayRange.utcStart;
  const endIso = dayRange.utcEnd;

  const entries = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.employeeId, employeeId),
        lt(timeEntries.clockIn, endIso),
        or(isNull(timeEntries.clockOut), gt(timeEntries.clockOut, startIso)),
      ),
    );
  if (!entries.length) return 0;

  const breaks = await db
    .select()
    .from(breakEntries)
    .where(
      and(
        inArray(
          breakEntries.timeEntryId,
          entries.map((item) => item.id),
        ),
        lt(breakEntries.startedAt, effectiveRange.utcEnd),
        or(isNull(breakEntries.endedAt), gt(breakEntries.endedAt, startIso)),
      ),
    );
  const workedMinutes = entries.reduce(
    (total, item) =>
      total +
      clippedDurationMinutes(
        item.clockIn,
        item.clockOut ?? nowIso,
        effectiveRange,
      ),
    0,
  );
  const breakMinutes = breaks.reduce(
    (total, item) =>
      total +
      clippedDurationMinutes(
        item.startedAt,
        item.endedAt ?? nowIso,
        effectiveRange,
      ),
    0,
  );
  return Math.max(0, workedMinutes - breakMinutes);
}

export async function clientClockIn(
  user: CurrentUser,
  input: {
    projectId: number | null;
    timeCode: "project" | "internal" | "learning" | "admin";
    workMode: "office" | "remote";
    source: ClientTimeSource;
  },
) {
  if (!user.employeeId) return { kind: "unlinked" as const };
  const [employee] = await getDb()
    .select({ status: employees.status })
    .from(employees)
    .where(eq(employees.id, user.employeeId))
    .limit(1);
  if (!employee || employee.status === "inactive") {
    return { kind: "inactive" as const };
  }
  const current = await getClientTimeStatus(user);
  if (current.entry) {
    return { kind: "already_running" as const, entry: current.entry };
  }

  const now = new Date().toISOString();
  const timeZone = await getEmployeeTimezone(user.employeeId);
  const workDate = getDateContext(new Date(now), timeZone).today;
  const workMonth = await getEmployeeMonthKey(user.employeeId, now);
  if (!workMonth || (await isTimesheetLocked(user.employeeId, workMonth))) {
    return { kind: "locked" as const };
  }
  if (input.projectId) {
    const [project] = await getDb()
      .select({ id: timeProjects.id })
      .from(timeProjects)
      .where(
        and(
          eq(timeProjects.id, input.projectId),
          eq(timeProjects.active, true),
        ),
      )
      .limit(1);
    if (!project) return { kind: "invalid_project" as const };
  }
  try {
    const d1 = getD1();
    const results = await d1.batch([
      d1
        .prepare(
          `INSERT INTO time_entries
             (employee_id, project_id, time_code, work_mode, clock_in, source)
           SELECT ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM timesheet_periods
             WHERE employee_id=? AND month=?
               AND status IN ('locking', 'locked', 'approved')
           )
           RETURNING id`,
        )
        .bind(
          user.employeeId,
          input.projectId,
          input.timeCode,
          input.workMode,
          now,
          input.source,
          user.employeeId,
          workMonth,
        ),
      d1
        .prepare(
          `INSERT INTO work_mode_entries(employee_id, work_date, mode, updated_at)
           SELECT ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM time_entries
             WHERE employee_id=? AND clock_in=?
           )
           ON CONFLICT(employee_id, work_date)
           DO UPDATE SET mode=excluded.mode, updated_at=excluded.updated_at`,
        )
        .bind(
          user.employeeId,
          workDate,
          input.workMode,
          now,
          user.employeeId,
          now,
        ),
      d1
        .prepare(
          `INSERT INTO audit_events
             (actor_email, action, entity_type, entity_id, details)
           SELECT ?, 'time.clock_in', 'time_entry', CAST(id AS TEXT), ?
           FROM time_entries
           WHERE employee_id=? AND clock_in=?
           LIMIT 1`,
        )
        .bind(
          user.email,
          `Work session started via ${input.source} (${input.workMode})`,
          user.employeeId,
          now,
        ),
    ]);
    const entryId = Number(
      (results[0]?.results?.[0] as { id?: number } | undefined)?.id ?? 0,
    );
    if (!entryId) {
      if (await isTimesheetLocked(user.employeeId, workMonth)) {
        return { kind: "locked" as const };
      }
      return { kind: "conflict" as const };
    }
    const [entry] = entryId
      ? await getDb()
          .select()
          .from(timeEntries)
          .where(eq(timeEntries.id, entryId))
          .limit(1)
      : [];
    if (!entry) throw new Error("Timer entry was not persisted.");
    return { kind: "started" as const, entry };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const resolved = await getClientTimeStatus(user);
    return resolved.entry
      ? { kind: "already_running" as const, entry: resolved.entry }
      : { kind: "conflict" as const };
  }
}

export async function clientClockOut(
  user: CurrentUser,
  source: ClientTimeSource,
) {
  if (!user.employeeId) return { kind: "unlinked" as const };
  const current = await getClientTimeStatus(user);
  if (!current.entry) return { kind: "already_stopped" as const };
  const now = new Date().toISOString();
  const affectedMonths = await getEmployeeMonthKeysForIntervals(
    user.employeeId,
    [{ start: current.entry.clockIn, end: now }],
  );
  if (await hasLockedTimesheetPeriods(user.employeeId, affectedMonths)) {
    return { kind: "locked" as const };
  }
  const d1 = getD1();
  const monthPlaceholders = affectedMonths.map(() => "?").join(", ");
  const results = await d1.batch([
    d1
      .prepare(
        `UPDATE break_entries
         SET ended_at=?
         WHERE time_entry_id=? AND ended_at IS NULL
           AND EXISTS (
             SELECT 1 FROM time_entries
             WHERE id=? AND clock_out IS NULL
           )
           AND NOT EXISTS (
             SELECT 1 FROM timesheet_periods
             WHERE employee_id=?
               AND status IN ('locking', 'locked', 'approved')
               AND month IN (${monthPlaceholders})
           )
         RETURNING id`,
      )
      .bind(
        now,
        current.entry.id,
        current.entry.id,
        user.employeeId,
        ...affectedMonths,
      ),
    d1
      .prepare(
        `UPDATE time_entries
         SET clock_out=?
         WHERE id=? AND clock_out IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM timesheet_periods
             WHERE employee_id=?
               AND status IN ('locking', 'locked', 'approved')
               AND month IN (${monthPlaceholders})
           )
         RETURNING id`,
      )
      .bind(now, current.entry.id, user.employeeId, ...affectedMonths),
    d1
      .prepare(
        `INSERT INTO audit_events
           (actor_email, action, entity_type, entity_id, details)
         SELECT ?, 'time.clock_out', 'time_entry', CAST(id AS TEXT), ?
         FROM time_entries
         WHERE id=? AND clock_out=?
         LIMIT 1`,
      )
      .bind(
        user.email,
        `Work session completed via ${source}`,
        current.entry.id,
        now,
      ),
  ]);
  if (results[1]?.meta.changes !== 1) {
    if (await hasLockedTimesheetPeriods(user.employeeId, affectedMonths)) {
      return { kind: "locked" as const };
    }
    return { kind: "already_stopped" as const };
  }
  const [entry] = await getDb()
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.id, current.entry.id))
    .limit(1);
  if (!entry) return { kind: "already_stopped" as const };
  return { kind: "stopped" as const, entry };
}
