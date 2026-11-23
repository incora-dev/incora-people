import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  breakEntries,
  companyHolidays,
  employees,
  leaveRequests,
  leaveRequestDays,
  timeCorrections,
  timeEntries,
  timeProjects,
  timesheetPeriods,
  workSchedules,
} from "@/db/schema";
import { hasOrganizationScope, type CurrentUser } from "@/lib/auth";
import {
  getDateContext,
  getMonthDateRange,
  getWeekDateRange,
  isValidTimeZone,
  isoWeekday,
  type DateContext,
} from "@/modules/shared/date";
import { getWorkspaceTimezone } from "@/modules/settings/system";
import {
  netDurationMinutes,
  netDurationMinutesClipped,
} from "@/modules/time/domain";

export async function getTimeOverview(
  employeeId: number,
  requestedDate?: DateContext,
) {
  const db = getDb();
  const [schedule] = await db
    .select()
    .from(workSchedules)
    .where(eq(workSchedules.employeeId, employeeId))
    .limit(1);
  const fallback = await getWorkspaceTimezone().catch(() => "Europe/Kyiv");
  const configuredTimezone = schedule?.timezone?.trim() ?? "";
  const timeZone = isValidTimeZone(configuredTimezone)
    ? configuredTimezone
    : isValidTimeZone(fallback)
      ? fallback
      : "Europe/Kyiv";
  const date = requestedDate ?? getDateContext(new Date(), timeZone);
  const [openEntry] = await db
    .select()
    .from(timeEntries)
    .where(
      and(eq(timeEntries.employeeId, employeeId), isNull(timeEntries.clockOut)),
    )
    .orderBy(desc(timeEntries.clockIn))
    .limit(1);

  const monthRange = getMonthDateRange(date.monthKey, timeZone);
  const weekRange = getWeekDateRange(date.today, timeZone);
  const historyRange = monthRange
    ? {
        utcStart:
          weekRange && weekRange.utcStart < monthRange.utcStart
            ? weekRange.utcStart
            : monthRange.utcStart,
        utcEnd:
          weekRange && weekRange.utcEnd > monthRange.utcEnd
            ? weekRange.utcEnd
            : monthRange.utcEnd,
      }
    : weekRange;

  const history = await db
    .select()
    .from(timeEntries)
    .where(
      historyRange
        ? and(
            eq(timeEntries.employeeId, employeeId),
            lt(timeEntries.clockIn, historyRange.utcEnd),
            or(
              isNull(timeEntries.clockOut),
              gt(timeEntries.clockOut, historyRange.utcStart),
            ),
          )
        : eq(timeEntries.employeeId, employeeId),
    )
    .orderBy(desc(timeEntries.clockIn));

  const [openBreak] = openEntry
    ? await db
        .select()
        .from(breakEntries)
        .where(
          and(
            eq(breakEntries.timeEntryId, openEntry.id),
            isNull(breakEntries.endedAt),
          ),
        )
        .orderBy(desc(breakEntries.startedAt))
        .limit(1)
    : [];

  const breakHistory = await db
    .select({
      id: breakEntries.id,
      timeEntryId: breakEntries.timeEntryId,
      startedAt: breakEntries.startedAt,
      endedAt: breakEntries.endedAt,
      createdAt: breakEntries.createdAt,
    })
    .from(breakEntries)
    .innerJoin(timeEntries, eq(breakEntries.timeEntryId, timeEntries.id))
    .where(
      historyRange
        ? and(
            eq(timeEntries.employeeId, employeeId),
            lt(timeEntries.clockIn, historyRange.utcEnd),
            or(
              isNull(timeEntries.clockOut),
              gt(timeEntries.clockOut, historyRange.utcStart),
            ),
            lt(breakEntries.startedAt, historyRange.utcEnd),
            or(
              isNull(breakEntries.endedAt),
              gt(breakEntries.endedAt, historyRange.utcStart),
            ),
          )
        : eq(timeEntries.employeeId, employeeId),
    )
    .orderBy(desc(breakEntries.startedAt));

  const approvedLeave = await db
    .select({
      id: leaveRequests.id,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.status, "approved"),
        lte(leaveRequests.startDate, date.monthEnd),
        gte(leaveRequests.endDate, date.monthStart),
      ),
    );

  const approvedLeaveDays = approvedLeave.length
    ? await db
        .select({
          requestId: leaveRequestDays.requestId,
          date: leaveRequestDays.leaveDate,
          amount: leaveRequestDays.amount,
        })
        .from(leaveRequestDays)
        .where(
          and(
            inArray(
              leaveRequestDays.requestId,
              approvedLeave.map((request) => request.id),
            ),
            gte(leaveRequestDays.leaveDate, date.monthStart),
            lte(leaveRequestDays.leaveDate, date.monthEnd),
          ),
        )
    : [];
  const absenceAllocations = buildAbsenceAllocations(
    approvedLeave,
    approvedLeaveDays,
    date.monthStart,
    date.monthEnd,
    schedule?.workDays,
  );

  const holidayRows = await db
    .select({ date: companyHolidays.date })
    .from(companyHolidays)
    .where(
      and(
        gte(companyHolidays.date, date.monthStart),
        lte(companyHolidays.date, date.monthEnd),
      ),
    );

  const corrections = await db
    .select()
    .from(timeCorrections)
    .where(eq(timeCorrections.employeeId, employeeId))
    .orderBy(desc(timeCorrections.createdAt))
    .limit(10);

  const [period] = await db
    .select()
    .from(timesheetPeriods)
    .where(
      and(
        eq(timesheetPeriods.employeeId, employeeId),
        eq(timesheetPeriods.month, date.monthKey),
      ),
    )
    .limit(1);

  return {
    openEntry,
    openBreak,
    timeZone,
    history,
    breakHistory,
    // Legacy rows may contain an invalid timezone. Keep the persisted row
    // visible for admin repair, but never leak it into UI date formatting.
    schedule: schedule ? { ...schedule, timezone: timeZone } : schedule,
    absenceDays: Object.values(absenceAllocations).reduce(
      (sum, amount) => sum + amount,
      0,
    ),
    absenceAllocations,
    corrections,
    periodLocked:
      period?.status === "locking" ||
      period?.status === "locked" ||
      period?.status === "approved",
    holidayDates: holidayRows.map((holiday) => holiday.date),
    date,
  };
}

function buildAbsenceAllocations(
  requests: { id: number; startDate: string; endDate: string; days: number }[],
  requestDays: { requestId: number; date: string; amount: number }[],
  monthStart: string,
  monthEnd: string,
  workDays = "1,2,3,4,5",
) {
  const result: Record<string, number> = {};
  const scheduledDays = new Set(workDays.split(",").map(Number));
  for (const request of requests) {
    const explicit = requestDays.filter((day) => day.requestId === request.id);
    if (explicit.length) {
      for (const day of explicit)
        result[day.date] = Math.max(result[day.date] ?? 0, day.amount);
      continue;
    }
    const cursor = new Date(
      `${request.startDate < monthStart ? monthStart : request.startDate}T12:00:00Z`,
    );
    const end = new Date(
      `${request.endDate > monthEnd ? monthEnd : request.endDate}T12:00:00Z`,
    );
    const singleDayAmount =
      request.startDate === request.endDate ? request.days : 1;
    while (cursor <= end) {
      if (scheduledDays.has(isoWeekday(cursor.getUTCDay()))) {
        const key = cursor.toISOString().slice(0, 10);
        result[key] = Math.max(result[key] ?? 0, Math.min(1, singleDayAmount));
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return result;
}

export async function getActiveTimeProjects() {
  return getDb()
    .select()
    .from(timeProjects)
    .where(eq(timeProjects.active, true))
    .orderBy(timeProjects.name);
}

export function getPendingCorrections(user: CurrentUser) {
  const query = getDb()
    .select({
      id: timeCorrections.id,
      employeeId: timeCorrections.employeeId,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      requestedClockIn: timeCorrections.requestedClockIn,
      requestedClockOut: timeCorrections.requestedClockOut,
      reason: timeCorrections.reason,
      status: timeCorrections.status,
      createdAt: timeCorrections.createdAt,
    })
    .from(timeCorrections)
    .innerJoin(employees, eq(timeCorrections.employeeId, employees.id));

  return query
    .where(
      hasOrganizationScope(user)
        ? eq(timeCorrections.status, "pending")
        : and(
            eq(timeCorrections.status, "pending"),
            eq(employees.managerId, user.employeeId ?? -1),
          ),
    )
    .orderBy(desc(timeCorrections.createdAt));
}

export async function getTeamTimesheets(user: CurrentUser, month: string) {
  const db = getDb();
  const people = await db
    .select({
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      jobTitle: employees.jobTitle,
      department: employees.department,
      team: employees.team,
    })
    .from(employees)
    .where(
      hasOrganizationScope(user)
        ? undefined
        : eq(employees.managerId, user.employeeId ?? -1),
    )
    .orderBy(employees.firstName, employees.lastName);

  const employeeIds = people.map((person) => person.employeeId);
  if (employeeIds.length === 0) return [];
  const schedules = await db
    .select()
    .from(workSchedules)
    .where(inArray(workSchedules.employeeId, employeeIds));
  const scheduleByEmployee = new Map(
    schedules.map((schedule) => [schedule.employeeId, schedule]),
  );
  const fallbackTimezone = await getWorkspaceTimezone().catch(
    () => "Europe/Kyiv",
  );
  const monthRanges = new Map(
    employeeIds.map((employeeId) => [
      employeeId,
      (() => {
        const configured =
          scheduleByEmployee.get(employeeId)?.timezone?.trim() ?? "";
        const timezone = isValidTimeZone(configured)
          ? configured
          : isValidTimeZone(fallbackTimezone)
            ? fallbackTimezone
            : "Europe/Kyiv";
        return getMonthDateRange(month, timezone);
      })(),
    ]),
  );
  const validRanges = [...monthRanges.values()].filter(
    (range): range is NonNullable<typeof range> => Boolean(range),
  );
  if (!validRanges.length) return [];
  const queryStart = validRanges.map((range) => range.utcStart).sort()[0];
  const queryEnd = validRanges
    .map((range) => range.utcEnd)
    .sort()
    .at(-1)!;
  const [entries, breaks, periods, corrections, holidays, absences] =
    await Promise.all([
      db
        .select({
          id: timeEntries.id,
          employeeId: timeEntries.employeeId,
          clockIn: timeEntries.clockIn,
          clockOut: timeEntries.clockOut,
          timeCode: timeEntries.timeCode,
        })
        .from(timeEntries)
        .where(
          and(
            inArray(timeEntries.employeeId, employeeIds),
            lt(timeEntries.clockIn, queryEnd),
            or(
              isNull(timeEntries.clockOut),
              gt(timeEntries.clockOut, queryStart),
            ),
          ),
        ),
      db
        .select({
          timeEntryId: breakEntries.timeEntryId,
          startedAt: breakEntries.startedAt,
          endedAt: breakEntries.endedAt,
        })
        .from(breakEntries)
        .innerJoin(timeEntries, eq(breakEntries.timeEntryId, timeEntries.id))
        .where(
          and(
            inArray(timeEntries.employeeId, employeeIds),
            lt(breakEntries.startedAt, queryEnd),
            or(
              isNull(breakEntries.endedAt),
              gt(breakEntries.endedAt, queryStart),
            ),
          ),
        ),
      db
        .select()
        .from(timesheetPeriods)
        .where(
          and(
            inArray(timesheetPeriods.employeeId, employeeIds),
            eq(timesheetPeriods.month, month),
          ),
        ),
      db
        .select({ employeeId: timeCorrections.employeeId })
        .from(timeCorrections)
        .where(
          and(
            inArray(timeCorrections.employeeId, employeeIds),
            eq(timeCorrections.status, "pending"),
            lt(timeCorrections.requestedClockIn, queryEnd),
            gte(timeCorrections.requestedClockIn, queryStart),
          ),
        ),
      db
        .select({ date: companyHolidays.date })
        .from(companyHolidays)
        .where(
          and(
            gte(companyHolidays.date, `${month}-01`),
            lte(companyHolidays.date, `${month}-31`),
          ),
        ),
      db
        .select({
          requestId: leaveRequests.id,
          employeeId: leaveRequests.employeeId,
          startDate: leaveRequests.startDate,
          endDate: leaveRequests.endDate,
          days: leaveRequests.days,
          leaveDate: leaveRequestDays.leaveDate,
          amount: leaveRequestDays.amount,
        })
        .from(leaveRequests)
        .leftJoin(
          leaveRequestDays,
          eq(leaveRequestDays.requestId, leaveRequests.id),
        )
        .where(
          and(
            inArray(leaveRequests.employeeId, employeeIds),
            eq(leaveRequests.status, "approved"),
            lte(leaveRequests.startDate, `${month}-31`),
            gte(leaveRequests.endDate, `${month}-01`),
          ),
        ),
    ]);

  return people.map((person) => {
    const schedule = scheduleByEmployee.get(person.employeeId);
    const personRange = monthRanges.get(person.employeeId);
    const personEntries = entries.filter(
      (entry) =>
        entry.employeeId === person.employeeId &&
        (!personRange ||
          (entry.clockIn < personRange.utcEnd &&
            (!entry.clockOut || entry.clockOut > personRange.utcStart))),
    );
    const period = periods.find(
      (item) => item.employeeId === person.employeeId,
    );
    const personAbsences = buildTeamAbsenceAllocations(
      absences.filter((absence) => absence.employeeId === person.employeeId),
      month,
      schedule?.workDays,
    );
    const expectedMinutes = getExpectedMinutes(
      month,
      schedule,
      new Set(holidays.map((holiday) => holiday.date)),
      personAbsences,
    );
    const workedMinutes = personEntries.reduce((total, entry) => {
      if (!entry.clockOut) return total;
      return (
        total +
        (personRange
          ? netDurationMinutesClipped(entry, breaks, personRange)
          : netDurationMinutes(entry, breaks))
      );
    }, 0);
    const codeMinutes = personEntries.reduce<Record<string, number>>(
      (total, entry) => {
        if (!entry.clockOut) return total;
        const minutes = personRange
          ? netDurationMinutesClipped(entry, breaks, personRange)
          : netDurationMinutes(entry, breaks);
        total[entry.timeCode] = (total[entry.timeCode] ?? 0) + minutes;
        return total;
      },
      {},
    );
    const hasSnapshot =
      ["locked", "approved"].includes(period?.status ?? "") &&
      period?.snapshotWorkedMinutes != null &&
      period?.snapshotExpectedMinutes != null &&
      period?.snapshotOvertimeMinutes != null;
    return {
      ...person,
      entryCount: personEntries.length,
      workedMinutes: hasSnapshot
        ? period.snapshotWorkedMinutes!
        : workedMinutes,
      expectedMinutes: hasSnapshot
        ? period.snapshotExpectedMinutes!
        : expectedMinutes,
      overtimeMinutes: hasSnapshot
        ? period.snapshotOvertimeMinutes!
        : Math.max(0, workedMinutes - expectedMinutes),
      longEntries: personEntries.filter(
        (entry) =>
          entry.clockOut &&
          (personRange
            ? netDurationMinutesClipped(entry, breaks, personRange)
            : netDurationMinutes(entry, breaks)) >
            12 * 60,
      ).length,
      codeMinutes,
      openEntries: personEntries.filter((entry) => !entry.clockOut).length,
      pendingCorrections: corrections.filter(
        (item) => item.employeeId === person.employeeId,
      ).length,
      status: (period?.status === "locking"
        ? "locked"
        : (period?.status ?? "open")) as
        "open" | "locked" | "approved" | "revision_required",
      lockedAt: period?.lockedAt ?? null,
      lockedByEmail: period?.lockedByEmail ?? null,
    };
  });
}

/** Calculate the values that are persisted when a period is locked. */
export async function getTimePeriodSnapshot(employeeId: number, month: string) {
  const rows = await getTeamTimesheets(
    {
      userId: null,
      email: "system:timesheet-snapshot",
      role: "super_admin",
      employeeId: null,
    },
    month,
  );
  const row = rows.find((item) => item.employeeId === employeeId);
  if (!row) return null;
  return {
    workedMinutes: row.workedMinutes,
    expectedMinutes: row.expectedMinutes,
    overtimeMinutes: row.overtimeMinutes,
  };
}

function getExpectedMinutes(
  month: string,
  schedule: typeof workSchedules.$inferSelect | undefined,
  holidays: Set<string>,
  absenceAllocations: Record<string, number>,
) {
  if (!schedule) return 0;
  const [year, monthNumber] = month.split("-").map(Number);
  const workDays = new Set(schedule.workDays.split(",").map(Number));
  const daily = Math.max(
    0,
    minutes(schedule.endTime) -
      minutes(schedule.startTime) -
      schedule.breakMinutes,
  );
  let days = 0;
  for (
    let day = 1;
    day <= new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    day += 1
  )
    if (
      workDays.has(
        isoWeekday(new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay()),
      ) &&
      !holidays.has(`${month}-${String(day).padStart(2, "0")}`) &&
      absenceAllocations[`${month}-${String(day).padStart(2, "0")}`] !== 1
    )
      days +=
        1 -
        (absenceAllocations[`${month}-${String(day).padStart(2, "0")}`] ?? 0);
  return days * daily;
}

function buildTeamAbsenceAllocations(
  rows: {
    requestId: number;
    startDate: string;
    endDate: string;
    days: number;
    leaveDate: string | null;
    amount: number | null;
  }[],
  month: string,
  workDays = "1,2,3,4,5",
) {
  const result: Record<string, number> = {};
  const scheduledDays = new Set(workDays.split(",").map(Number));
  const requests = new Map<
    number,
    { startDate: string; endDate: string; days: number; explicit: boolean }
  >();
  for (const row of rows) {
    const request = requests.get(row.requestId) ?? {
      startDate: row.startDate,
      endDate: row.endDate,
      days: row.days,
      explicit: false,
    };
    if (row.leaveDate) {
      request.explicit = true;
      result[row.leaveDate] = Math.max(
        result[row.leaveDate] ?? 0,
        row.amount ?? 0,
      );
    }
    requests.set(row.requestId, request);
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const monthEnd = `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;
  for (const request of requests.values()) {
    if (request.explicit) continue;
    const start =
      request.startDate < `${month}-01` ? `${month}-01` : request.startDate;
    const end = request.endDate > monthEnd ? monthEnd : request.endDate;
    const cursor = new Date(`${start}T12:00:00Z`);
    const last = new Date(`${end}T12:00:00Z`);
    const amount = request.startDate === request.endDate ? request.days : 1;
    while (cursor <= last) {
      if (scheduledDays.has(isoWeekday(cursor.getUTCDay()))) {
        result[cursor.toISOString().slice(0, 10)] = Math.max(
          result[cursor.toISOString().slice(0, 10)] ?? 0,
          Math.min(1, amount),
        );
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return result;
}
function minutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
