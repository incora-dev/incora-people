import { and, desc, eq, isNull } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { breakEntries, timeEntries } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { isUniqueConstraintError } from "@/modules/shared/database-errors";
import {
  getEmployeeMonthKeysForIntervals,
  hasLockedTimesheetPeriods,
} from "@/modules/time/periods";

export type BreakAction = "start" | "end";

export class BreakCommandError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** Change a break and its audit event in one D1 batch. */
export async function changeBreak(
  user: CurrentUser,
  input: { action: BreakAction; breakId?: number },
) {
  if (!user.employeeId) {
    throw new BreakCommandError(
      "Your account is not linked to an employee.",
      403,
    );
  }
  const db = getDb();
  const [openTime] = await db
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
  if (!openTime) {
    throw new BreakCommandError("Clock in before starting a break.", 409);
  }
  const [openBreak] = await db
    .select()
    .from(breakEntries)
    .where(
      and(
        eq(breakEntries.timeEntryId, openTime.id),
        isNull(breakEntries.endedAt),
      ),
    )
    .orderBy(desc(breakEntries.startedAt))
    .limit(1);

  if (input.action === "start") {
    if (openBreak) return { mode: "break_start" as const, entry: openBreak };
    const now = new Date().toISOString();
    const affectedMonths = await getEmployeeMonthKeysForIntervals(
      user.employeeId,
      [{ start: openTime.clockIn, end: now }],
    );
    if (await hasLockedTimesheetPeriods(user.employeeId, affectedMonths)) {
      throw new BreakCommandError("This timesheet period is locked.", 409);
    }
    const monthPlaceholders = affectedMonths.map(() => "?").join(", ");
    try {
      const d1 = getD1();
      const [result] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO break_entries(time_entry_id, started_at)
             SELECT ?, ?
             WHERE EXISTS (
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
            openTime.id,
            now,
            openTime.id,
            user.employeeId,
            ...affectedMonths,
          ),
        d1
          .prepare(
            `INSERT INTO audit_events
               (actor_email, action, entity_type, entity_id, details)
             SELECT ?, 'time.break_start', 'break_entry', CAST(id AS TEXT),
               'Break started'
             FROM break_entries
             WHERE time_entry_id=? AND started_at=? LIMIT 1`,
          )
          .bind(user.email, openTime.id, now),
      ]);
      const id = Number(
        (result.results?.[0] as { id?: number } | undefined)?.id ?? 0,
      );
      if (!id) {
        if (await hasLockedTimesheetPeriods(user.employeeId, affectedMonths)) {
          throw new BreakCommandError("This timesheet period is locked.", 409);
        }
        throw new BreakCommandError(
          "Break state changed. Refresh and retry.",
          409,
        );
      }
      const [entry] = await db
        .select()
        .from(breakEntries)
        .where(eq(breakEntries.id, id))
        .limit(1);
      if (!entry) throw new BreakCommandError("Break was not persisted.", 500);
      return { mode: "break_start" as const, entry };
    } catch (error) {
      if (error instanceof BreakCommandError) throw error;
      if (isUniqueConstraintError(error)) {
        const [current] = await db
          .select()
          .from(breakEntries)
          .where(
            and(
              eq(breakEntries.timeEntryId, openTime.id),
              isNull(breakEntries.endedAt),
            ),
          )
          .orderBy(desc(breakEntries.startedAt))
          .limit(1);
        if (current) return { mode: "break_start" as const, entry: current };
      }
      throw error;
    }
  }

  if (!input.breakId) {
    throw new BreakCommandError(
      "breakId is required when ending a break.",
      400,
    );
  }
  const now = new Date().toISOString();
  const affectedMonths = await getEmployeeMonthKeysForIntervals(
    user.employeeId,
    [{ start: openTime.clockIn, end: now }],
  );
  if (await hasLockedTimesheetPeriods(user.employeeId, affectedMonths)) {
    throw new BreakCommandError("This timesheet period is locked.", 409);
  }
  const monthPlaceholders = affectedMonths.map(() => "?").join(", ");
  const d1 = getD1();
  const [result] = await d1.batch([
    d1
      .prepare(
        `UPDATE break_entries
         SET ended_at=?
         WHERE id=? AND time_entry_id=? AND ended_at IS NULL
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
        input.breakId,
        openTime.id,
        user.employeeId,
        ...affectedMonths,
      ),
    d1
      .prepare(
        `INSERT INTO audit_events
           (actor_email, action, entity_type, entity_id, details)
         SELECT ?, 'time.break_end', 'break_entry', CAST(id AS TEXT),
           'Break completed'
         FROM break_entries
         WHERE id=? AND time_entry_id=? AND ended_at=? LIMIT 1`,
      )
      .bind(user.email, input.breakId, openTime.id, now),
  ]);
  const id = Number(
    (result.results?.[0] as { id?: number } | undefined)?.id ?? 0,
  );
  if (!id) {
    if (await hasLockedTimesheetPeriods(user.employeeId, affectedMonths)) {
      throw new BreakCommandError("This timesheet period is locked.", 409);
    }
    throw new BreakCommandError(
      "This break was already stopped or does not belong to the active timer.",
      409,
    );
  }
  const [entry] = await db
    .select()
    .from(breakEntries)
    .where(eq(breakEntries.id, id))
    .limit(1);
  if (!entry) throw new BreakCommandError("Break was not persisted.", 500);
  return { mode: "break_end" as const, entry };
}
