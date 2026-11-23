import assert from "node:assert/strict";
import test from "node:test";
import {
  countWorkdays,
  calculateInitialAnnualAllowance,
  roundLeaveAccrual,
  validateDailyAllocations,
} from "../modules/leave/domain.ts";
import {
  classifyWorkday,
  intervalIntersectsRange,
  intervalsOverlap,
  monthFromTimestamp,
  netDurationMinutes,
  netDurationMinutesClipped,
  parseTimeInterval,
} from "../modules/time/domain.ts";
import { hasMinimumRole } from "../lib/roles.ts";
import {
  isReimbursementCategory,
  reimbursementCategories,
} from "../modules/reimbursements/domain.ts";
import {
  getDateContext,
  formatTimeInZone,
  getDayDateRange,
  getMonthDateRange,
  getWeekDateRange,
  isValidTimeZone,
  isoWeekday,
  localDateKey,
  monthKeysForInterval,
  normalizeDateTime,
  yearFromDate,
  zonedDateTimeToUtc,
} from "../modules/shared/date.ts";
import { createLeaveRequestSchema } from "../modules/leave/contracts.ts";
import {
  createProfileRecordSchema,
  updateProfileRecordSchema,
} from "../modules/people/contracts.ts";
import { csvRowsToObjects, parseCsv } from "../modules/people/csv.ts";
import {
  manualTimeEntrySchema,
  updateTimesheetPeriodSchema,
  workScheduleSchema,
} from "../modules/time/contracts.ts";
import { calculateSquareCrop } from "../modules/files/image-crop.ts";
import { readImageDimensions } from "../modules/files/image-metadata.ts";
import {
  applyInventoryDelta,
  calculateStockDelta,
  canManageInventory,
  isBelowInventoryMinimum,
  isValidInventoryDate,
} from "../modules/inventory/domain.ts";
import { csvCell } from "../lib/csv.ts";
import { groupLeaveCalendarEvents } from "../modules/leave/calendar.ts";
import {
  addCalendarDays,
  addCalendarMonths,
  calendarMonthDays,
  formatManualDate,
  parseManualDate,
  resolveProbationEnd,
} from "../modules/people/dates.ts";
import {
  calculatePreviousExperienceDays,
  buildEmploymentTimeline,
  collapseEmploymentSnapshots,
  employmentStateKey,
  employmentChangeConflict,
  genericProfileStartDateChanged,
  latestEmploymentStateChangeDate,
} from "../modules/people/employment-profile.ts";
import { compensationSchema } from "../modules/compensation/contracts.ts";
import { employeeDefaultsSchema } from "../modules/settings/contracts.ts";
import {
  canReadEmployeePrivateDetails,
  canReadEmployeeSensitiveData,
  sensitiveEmployeeMutationResponse,
  toEmployeeEditDto,
} from "../modules/people/privacy.ts";
import { canReadCompensationAttachment } from "../modules/people/privacy.ts";
import { groupCompensationAttachments } from "../modules/compensation/attachments.ts";
import { filterVisibleOneOnOnePlans } from "../modules/one-on-one/domain.ts";
import {
  filterEmployeeDirectoryItems,
  getEmployeeLifecycleStage,
  sortEmployeeDirectoryItems,
} from "../modules/people/directory.ts";
import { tenureYears } from "../modules/people/tenure.ts";

function directoryEmployee(id, firstName, lastName, overrides = {}) {
  return {
    id,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}@example.test`,
    jobTitle: "Engineer",
    employmentType: "Full-time",
    level: "Middle",
    department: "Engineering",
    division: "Product",
    team: "Platform",
    location: "Kyiv",
    managerName: null,
    startDate: "2020-01-01",
    status: "active",
    probationEnd: null,
    workMode: "office",
    photoFileId: null,
    technologies: "TypeScript",
    lifecycleStatus: "working",
    lastWorkingDay: null,
    managerId: null,
    ...overrides,
  };
}

test("People directory sorts Ukrainian display names in both directions deterministically", () => {
  const employees = [
    directoryEmployee(5, "Ярина", "Коваль"),
    directoryEmployee(4, "Жанна", "Левченко"),
    directoryEmployee(2, "Богдан", "Мельник"),
    directoryEmployee(1, "Анна", "Шевченко"),
    directoryEmployee(3, "Євген", "Бойко"),
    directoryEmployee(7, "Анна", "Шевченко"),
  ];
  assert.deepEqual(
    sortEmployeeDirectoryItems(
      employees,
      "name-asc",
      "uk",
      "2026-10-27",
      tenureYears,
    ).map((employee) => employee.id),
    [1, 7, 2, 3, 4, 5],
  );
  assert.deepEqual(
    sortEmployeeDirectoryItems(
      employees,
      "name-desc",
      "uk",
      "2026-10-27",
      tenureYears,
    ).map((employee) => employee.id),
    [5, 4, 3, 2, 1, 7],
  );
});

test("People directory tenure sorting stops at termination and keeps missing dates last", () => {
  const employees = [
    directoryEmployee(1, "Long", "Service", { startDate: "2010-01-01" }),
    directoryEmployee(2, "Short", "Service", { startDate: "2025-01-01" }),
    directoryEmployee(3, "Former", "Employee", {
      startDate: "2000-01-01",
      status: "inactive",
      lifecycleStatus: "terminated",
      lastWorkingDay: "2005-01-01",
    }),
    directoryEmployee(4, "Unknown", "Date", { startDate: "" }),
  ];
  assert.deepEqual(
    sortEmployeeDirectoryItems(
      employees,
      "tenure-desc",
      "en",
      "2026-10-27",
      tenureYears,
    ).map((employee) => employee.id),
    [1, 3, 2, 4],
  );
  assert.deepEqual(
    sortEmployeeDirectoryItems(
      employees,
      "tenure-asc",
      "en",
      "2026-10-27",
      tenureYears,
    ).map((employee) => employee.id),
    [2, 3, 1, 4],
  );

  const equalTenure = [
    directoryEmployee(9, "Zoe", "Reed", { startDate: "2022-01-01" }),
    directoryEmployee(7, "Alex", "Morgan", { startDate: "2022-01-01" }),
    directoryEmployee(3, "Alex", "Morgan", { startDate: "2022-01-01" }),
  ];
  for (const order of ["tenure-desc", "tenure-asc"]) {
    assert.deepEqual(
      sortEmployeeDirectoryItems(
        equalTenure,
        order,
        "en",
        "2026-10-27",
        tenureYears,
      ).map((employee) => employee.id),
      [3, 7, 9],
    );
  }
});

test("People directory lifecycle filters keep probation active and compose with search", () => {
  const employees = [
    directoryEmployee(1, "Alex", "Morgan", {
      lifecycleStatus: "terminated",
      status: "inactive",
    }),
    directoryEmployee(2, "Alex", "Carter", {
      lifecycleStatus: "terminated",
      status: "inactive",
    }),
    directoryEmployee(3, "Emma", "Morgan", {
      lifecycleStatus: "probation",
      probationEnd: "2026-12-01",
    }),
    directoryEmployee(4, "Emma", "Adams", {
      lifecycleStatus: "probation",
      probationEnd: "2026-12-01",
    }),
    directoryEmployee(5, "Sam", "Reed"),
  ];
  assert.deepEqual(
    filterEmployeeDirectoryItems(employees, {
      lifecycle: "active",
      locale: "en",
    }).map((employee) => employee.id),
    [3, 4, 5],
  );
  assert.deepEqual(
    filterEmployeeDirectoryItems(employees, {
      lifecycle: "terminated",
      locale: "en",
    }).map((employee) => employee.id),
    [1, 2],
  );
  assert.equal(
    filterEmployeeDirectoryItems(employees, {
      lifecycle: "all",
      locale: "en",
    }).length,
    5,
  );
  const combined = filterEmployeeDirectoryItems(employees, {
    query: "alex",
    lifecycle: "terminated",
    locale: "en",
  });
  assert.deepEqual(
    sortEmployeeDirectoryItems(
      combined,
      "name-asc",
      "en",
      "2026-10-27",
      tenureYears,
    ).map((employee) => employee.id),
    [2, 1],
  );
});

test("employment-cycle filter uses canonical lifecycle stages and composes with quick status/search", () => {
  const employees = [
    directoryEmployee(1, "Alex", "Morgan", { lifecycleStatus: "working" }),
    directoryEmployee(2, "Alex", "Carter", {
      lifecycleStatus: "terminated",
      status: "inactive",
    }),
    directoryEmployee(3, "Emma", "Morgan", {
      lifecycleStatus: "probation",
      probationEnd: "2026-12-01",
    }),
    directoryEmployee(4, "Emma", "Adams", {
      lifecycleStatus: "probation",
      probationEnd: "2026-12-01",
    }),
  ];
  assert.deepEqual(
    filterEmployeeDirectoryItems(employees, {
      employmentCycle: "working",
      lifecycle: "all",
      locale: "en",
    }).map((employee) => employee.id),
    [1],
  );
  assert.deepEqual(
    filterEmployeeDirectoryItems(employees, {
      employmentCycle: "terminated",
      lifecycle: "terminated",
      query: "alex",
      locale: "en",
    }).map((employee) => employee.id),
    [2],
  );
  assert.deepEqual(
    filterEmployeeDirectoryItems(employees, {
      employmentCycle: "probation",
      lifecycle: "active",
      locale: "en",
    }).map((employee) => employee.id),
    [3, 4],
  );
  assert.deepEqual(
    filterEmployeeDirectoryItems(employees, {
      employmentCycle: "probation",
      lifecycle: "terminated",
      locale: "en",
    }),
    [],
    "contradictory filters return an empty result instead of overriding each other",
  );
  assert.deepEqual(
    filterEmployeeDirectoryItems(employees, {
      employmentCycle: "probation",
      lifecycle: "all",
      query: "emma",
      locale: "en",
    }).map((employee) => employee.id),
    [3, 4],
  );
  const combinedStageSearch = filterEmployeeDirectoryItems(employees, {
    employmentCycle: "probation",
    lifecycle: "active",
    query: "emma",
    locale: "en",
  });
  assert.deepEqual(
    sortEmployeeDirectoryItems(
      combinedStageSearch,
      "name-asc",
      "en",
      "2026-10-27",
      tenureYears,
    ).map((employee) => employee.id),
    [4, 3],
  );
});

test("employment lifecycle stage derives only from canonical status and probation end", () => {
  assert.equal(
    getEmployeeLifecycleStage("active", null, "2026-10-27"),
    "working",
  );
  assert.equal(
    getEmployeeLifecycleStage("active", "2026-10-27", "2026-10-27"),
    "probation",
  );
  assert.equal(
    getEmployeeLifecycleStage("active", "2026-10-26", "2026-10-27"),
    "working",
  );
  assert.equal(
    getEmployeeLifecycleStage("inactive", "2026-12-01", "2026-10-27"),
    "terminated",
  );
  assert.equal(
    getEmployeeLifecycleStage("on_leave", null, "2026-10-27"),
    "on_leave",
  );
  assert.equal(
    getEmployeeLifecycleStage("active", "2026-10-30", "2026-10-27"),
    "probation",
    "a current or future probation end date remains in the probation stage",
  );
});

test("one-on-one workspace ignores orphaned plans without crashing", () => {
  const plans = [
    { id: 1, employeeId: 10, facilitatorEmail: "hr@example.test" },
    { id: 2, employeeId: 99, facilitatorEmail: "hr@example.test" },
    { id: 3, employeeId: 20, facilitatorEmail: "hr@example.test" },
  ];
  const visible = filterVisibleOneOnOnePlans(
    plans,
    [
      { id: 10, managerId: null },
      { id: 20, managerId: null },
    ],
    {
      managePeople: true,
      email: "hr@example.test",
      employeeId: null,
    },
  );
  assert.deepEqual(
    visible.map((plan) => plan.id),
    [1, 3],
    "orphaned plans must not reach the renderer as an undefined employee",
  );
});

test("one-on-one workspace keeps known inactive employees in historical plans", () => {
  const visible = filterVisibleOneOnOnePlans(
    [{ id: 7, employeeId: 42, facilitatorEmail: "hr@example.test" }],
    [{ id: 42, managerId: null, status: "inactive" }],
    {
      managePeople: true,
      email: "hr@example.test",
      employeeId: null,
    },
  );
  assert.deepEqual(
    visible.map((plan) => plan.employeeId),
    [42],
  );
});

test("derives the workspace date in Europe/Kyiv", () => {
  const context = getDateContext(
    new Date("2026-12-31T22:30:00.000Z"),
    "Europe/Kyiv",
  );
  assert.equal(context.today, "2027-01-01");
  assert.equal(context.year, 2027);
  assert.equal(context.monthKey, "2027-01");
  assert.equal(context.monthEnd, "2027-01-31");
});

test("formats date-only defaults from local calendar components without a UTC shift", () => {
  const originalTimeZone = process.env.TZ;
  try {
    process.env.TZ = "Europe/Kyiv";
    const afterLocalMidnight = new Date("2026-10-07T21:30:00.000Z");
    assert.equal(afterLocalMidnight.toISOString().slice(0, 10), "2026-10-07");
    assert.equal(localDateKey(afterLocalMidnight), "2026-10-08");
    assert.equal(localDateKey(new Date(2026, 9, 8, 12, 0)), "2026-10-08");
    assert.equal(localDateKey(new Date(2024, 1, 29, 0, 5)), "2024-02-29");
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test("generic profile edits cannot silently rewrite the employment start date", () => {
  assert.equal(genericProfileStartDateChanged("2024-01-15", undefined), false);
  assert.equal(
    genericProfileStartDateChanged("2024-01-15", "2024-01-15"),
    false,
  );
  assert.equal(
    genericProfileStartDateChanged("2024-01-15", "2024-01-16"),
    true,
  );
});

test("groups multiple approved absences under one calendar person", () => {
  const grouped = groupLeaveCalendarEvents([
    {
      id: 11,
      employeeId: 12,
      firstName: "Demo3",
      lastName: "FixtureSurname3",
      department: "Administration",
      typeName: "Vacation",
      color: "#27b3a2",
      startDate: "2026-09-02",
      endDate: "2026-09-04",
      days: 3,
    },
    {
      id: 12,
      employeeId: 12,
      firstName: "Demo3",
      lastName: "FixtureSurname3",
      department: "Administration",
      typeName: "Sick Leave",
      color: "#e05a67",
      startDate: "2026-09-15",
      endDate: "2026-09-16",
      days: 2,
    },
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].employeeId, 12);
  assert.deepEqual(
    grouped[0].absences.map((absence) => absence.id),
    [11, 12],
  );
});

test("normalizes Sunday to the ISO schedule day 7", () => {
  assert.equal(isoWeekday(0), 7);
  assert.equal(isoWeekday(1), 1);
});

test("builds timezone-aware month boundaries", () => {
  const range = getMonthDateRange("2026-07", "Europe/Kyiv");
  assert.ok(range);
  assert.equal(range.monthStart, "2026-07-01");
  assert.equal(range.monthEnd, "2026-07-31");
  assert.equal(range.utcStart, "2026-06-30T21:00:00.000Z");
  assert.equal(range.utcEnd, "2026-07-31T21:00:00.000Z");
  assert.equal(getMonthDateRange("2026-13"), null);
  assert.equal(isValidTimeZone("Europe/Kyiv"), true);
  assert.equal(isValidTimeZone("Not/A-Timezone"), false);
});

test("builds a timezone-aware visible week around month boundaries", () => {
  const range = getWeekDateRange("2026-09-01", "Europe/Kyiv");
  assert.ok(range);
  assert.equal(range.weekStart, "2026-08-31");
  assert.equal(range.weekEnd, "2026-09-07");
  assert.equal(range.utcStart, "2026-08-30T21:00:00.000Z");
  assert.equal(range.utcEnd, "2026-09-06T21:00:00.000Z");
});

test("rejects invalid schedules before they can be persisted", () => {
  const valid = {
    workDays: "1,2,3,4,5",
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: 60,
    timezone: "Europe/Kyiv",
  };
  assert.equal(workScheduleSchema.safeParse(valid).success, true);
  assert.equal(
    workScheduleSchema.safeParse({ ...valid, timezone: "Not/A-Timezone" })
      .success,
    false,
  );
  assert.equal(
    workScheduleSchema.safeParse({ ...valid, startTime: "99:00" }).success,
    false,
  );
  assert.equal(
    workScheduleSchema.safeParse({ ...valid, startTime: "09:99" }).success,
    false,
  );
  assert.equal(
    workScheduleSchema.safeParse({ ...valid, endTime: "17:75" }).success,
    false,
  );
  assert.equal(
    workScheduleSchema.safeParse({ ...valid, endTime: "08:00" }).success,
    false,
  );
  assert.equal(
    workScheduleSchema.safeParse({ ...valid, workDays: "1,1,2" }).success,
    false,
  );
});

test("includes every local month touched by a time interval", () => {
  assert.deepEqual(
    monthKeysForInterval(
      "2026-08-31T23:00:00.000Z",
      "2026-09-01T01:00:00.000Z",
      "Europe/Kyiv",
    ),
    ["2026-09"],
  );
  assert.deepEqual(
    monthKeysForInterval(
      "2026-08-31T20:00:00.000Z",
      "2026-09-01T01:00:00.000Z",
      "Europe/Kyiv",
    ),
    ["2026-08", "2026-09"],
  );
});

test("clips cross-midnight work and breaks to the employee local day", () => {
  const range = getDayDateRange("2026-09-01", "Europe/Kyiv");
  assert.ok(range);
  const entry = {
    id: 11,
    clockIn: "2026-08-31T20:00:00.000Z",
    clockOut: "2026-08-31T22:00:00.000Z",
  };
  assert.equal(
    netDurationMinutesClipped(
      entry,
      [
        {
          timeEntryId: 11,
          startedAt: "2026-08-31T21:10:00.000Z",
          endedAt: "2026-08-31T21:40:00.000Z",
        },
      ],
      range,
    ),
    30,
  );
});

test("finds overnight entries in both local calendar days", () => {
  const previousDay = getDayDateRange("2026-08-31", "Europe/Kyiv");
  const nextDay = getDayDateRange("2026-09-01", "Europe/Kyiv");
  assert.ok(previousDay && nextDay);
  const start = "2026-08-31T20:00:00.000Z";
  const end = "2026-08-31T22:00:00.000Z";
  assert.equal(intervalIntersectsRange(start, end, previousDay), true);
  assert.equal(intervalIntersectsRange(start, end, nextDay), true);
  assert.equal(
    intervalIntersectsRange(
      "2026-08-31T18:59:59.000Z",
      "2026-08-31T19:00:00.000Z",
      nextDay,
    ),
    false,
  );
});

test("counts weekdays and rejects invalid leave ranges", () => {
  assert.equal(countWorkdays("2026-07-20", "2026-07-24"), 5);
  assert.equal(countWorkdays("2026-07-24", "2026-07-27"), 2);
  assert.equal(countWorkdays("2026-07-25", "2026-07-26"), 0);
  assert.equal(
    countWorkdays("2026-07-20", "2026-07-24", new Set(["2026-07-22"])),
    4,
  );
  assert.equal(countWorkdays("2026-07-27", "2026-07-20"), 0);
  assert.equal(
    countWorkdays("2026-07-19", "2026-07-19", new Set(), new Set([7])),
    1,
  );
  assert.equal(yearFromDate("2026-07-23"), 2026);
  assert.equal(yearFromDate("23-07-2026"), null);
});

test("validates day-by-day leave amounts and rounds accrual to half-days", () => {
  const result = validateDailyAllocations("2026-07-20", "2026-07-22", [
    { date: "2026-07-20", amount: 1 },
    { date: "2026-07-21", amount: 0.5 },
    { date: "2026-07-22", amount: 0 },
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.total, 1.5);
  assert.equal(
    validateDailyAllocations("2026-07-20", "2026-07-21", [
      { date: "2026-07-20", amount: 0 },
      { date: "2026-07-21", amount: 0 },
    ]).ok,
    false,
  );
  const customSchedule = validateDailyAllocations(
    "2026-07-19",
    "2026-07-19",
    [{ date: "2026-07-19", amount: 0.5 }],
    new Set(),
    new Set([7]),
  );
  assert.equal(customSchedule.ok, true);
  assert.equal(roundLeaveAccrual(1.24), 1);
  assert.equal(roundLeaveAccrual(1.26), 1.5);
  assert.equal(calculateInitialAnnualAllowance(24, "2026-01-01", 2026), 24);
  assert.equal(calculateInitialAnnualAllowance(24, "2026-01-16", 2026), 23);
  assert.equal(calculateInitialAnnualAllowance(24, "2025-08-20", 2026), 24);
  assert.equal(calculateInitialAnnualAllowance(24, "2027-01-01", 2026), 0);
});

test("parses quoted employee CSV data", () => {
  assert.deepEqual(parseCsv('name,team\n"Jane, Doe","Web ""Core"""\n'), [
    ["name", "team"],
    ["Jane, Doe", 'Web "Core"'],
  ]);
  assert.deepEqual(
    csvRowsToObjects("firstName,lastName,email\nJane,Doe,jane@incorainc.com"),
    [
      {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@incorainc.com",
      },
    ],
  );
});

test("validates time intervals and every overlap shape", () => {
  const existing = parseTimeInterval(
    "2026-07-23T09:00:00.000Z",
    "2026-07-23T18:00:00.000Z",
  );
  const contained = parseTimeInterval(
    "2026-07-23T10:00:00.000Z",
    "2026-07-23T11:00:00.000Z",
  );
  const wrapping = parseTimeInterval(
    "2026-07-23T08:00:00.000Z",
    "2026-07-23T19:00:00.000Z",
  );
  const adjacent = parseTimeInterval(
    "2026-07-23T18:00:00.000Z",
    "2026-07-23T19:00:00.000Z",
  );

  assert.ok(existing);
  assert.ok(contained);
  assert.ok(wrapping);
  assert.ok(adjacent);
  assert.equal(intervalsOverlap(existing, contained), true);
  assert.equal(intervalsOverlap(existing, wrapping), true);
  assert.equal(intervalsOverlap(existing, adjacent), false);
  assert.equal(
    parseTimeInterval("2026-07-23T09:00:00.000Z", "2026-07-25T09:00:00.000Z"),
    null,
  );
});

test("calculates net worked time after clipping recorded breaks", () => {
  const entry = {
    id: 7,
    clockIn: "2026-09-02T06:00:00.000Z",
    clockOut: "2026-09-02T15:00:00.000Z",
  };
  assert.equal(
    netDurationMinutes(entry, [
      {
        timeEntryId: 7,
        startedAt: "2026-09-02T10:00:00.000Z",
        endedAt: "2026-09-02T11:00:00.000Z",
      },
      {
        timeEntryId: 7,
        startedAt: "2026-09-02T14:30:00.000Z",
        endedAt: "2026-09-02T16:00:00.000Z",
      },
    ]),
    450,
  );
});

test("marks every missed past workday as underworked", () => {
  const base = {
    today: "2026-09-10",
    expectedMinutes: 480,
    scheduled: true,
    holiday: false,
    absenceAmount: 0,
  };
  assert.equal(
    classifyWorkday({ ...base, date: "2026-09-09", workedMinutes: 0 }),
    "underworked",
  );
  assert.equal(
    classifyWorkday({ ...base, date: "2026-09-10", workedMinutes: 0 }),
    "open",
  );
  assert.equal(
    classifyWorkday({
      ...base,
      date: "2026-09-09",
      workedMinutes: 0,
      absenceAmount: 1,
    }),
    "absence",
  );
  assert.equal(
    classifyWorkday({
      ...base,
      date: "2026-09-09",
      workedMinutes: 180,
      absenceAmount: 0.5,
    }),
    "underworked",
  );
});

test("derives and validates timesheet periods", () => {
  assert.equal(monthFromTimestamp("2026-07-23T09:00:00.000Z"), "2026-07");
  assert.equal(monthFromTimestamp("invalid"), null);
  assert.equal(
    updateTimesheetPeriodSchema.safeParse({
      month: "2026-07",
      status: "locked",
      note: "",
    }).success,
    true,
  );
  assert.equal(
    updateTimesheetPeriodSchema.safeParse({
      month: "2026-13",
      status: "closed",
    }).success,
    false,
  );
});

test("converts scheduled local time using the employee timezone", () => {
  assert.equal(
    zonedDateTimeToUtc("2026-07-24", "09:00", "Europe/Kyiv")?.toISOString(),
    "2026-07-24T06:00:00.000Z",
  );
  assert.equal(zonedDateTimeToUtc("2026-07-24", "09:00", "Invalid/Zone"), null);
});

test("normalizes browser local datetimes in the workspace timezone", () => {
  assert.equal(
    normalizeDateTime("2026-08-13T18:05", "Europe/Kyiv"),
    "2026-08-13T15:05:00.000Z",
  );
  assert.equal(
    normalizeDateTime("2026-01-13T18:05", "Europe/Kyiv"),
    "2026-01-13T16:05:00.000Z",
  );
  assert.equal(
    normalizeDateTime("2026-08-13T15:05:00.000Z", "Europe/Kyiv"),
    "2026-08-13T15:05:00.000Z",
  );
  assert.equal(normalizeDateTime("not-a-date", "Europe/Kyiv"), null);
});

test("escapes CSV formula payloads for spreadsheet exports", () => {
  assert.equal(
    csvCell('=HYPERLINK("https://example.com")'),
    `"'=HYPERLINK(""https://example.com"")"`,
  );
  assert.equal(csvCell('Jane, "Doe"'), '"Jane, ""Doe"""');
});

test("calculates a square profile crop without stretching the image", () => {
  assert.deepEqual(calculateSquareCrop(1200, 800, 1, 0, 0), {
    sourceX: 200,
    sourceY: 0,
    sourceSize: 800,
  });
  assert.deepEqual(calculateSquareCrop(800, 1200, 1, 0, 1), {
    sourceX: 0,
    sourceY: 400,
    sourceSize: 800,
  });
  assert.deepEqual(calculateSquareCrop(1000, 800, 2, -1, -1), {
    sourceX: 0,
    sourceY: 0,
    sourceSize: 400,
  });
  assert.equal(calculateSquareCrop(0, 800, 1, 0, 0), null);
});

test("reads uploaded image dimensions without trusting the file extension", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47], 0);
  png.set([0x49, 0x48, 0x44, 0x52], 12);
  png.set([0, 0, 4, 176], 16);
  png.set([0, 0, 3, 32], 20);
  assert.deepEqual(readImageDimensions(png), { width: 1200, height: 800 });
  assert.equal(readImageDimensions(new Uint8Array([1, 2, 3])), null);
});

test("fails closed when a Knowledge role is invalid", () => {
  assert.equal(hasMinimumRole("hr_admin", "manager"), true);
  assert.equal(hasMinimumRole("manager", "hr_admin"), false);
  assert.equal(hasMinimumRole("employee", "unknown"), false);
});

test("keeps reimbursement categories in one domain contract", () => {
  assert.deepEqual(reimbursementCategories, [
    "Sport",
    "Health",
    "Education",
    "Other",
  ]);
  assert.equal(isReimbursementCategory("Health"), true);
  assert.equal(isReimbursementCategory("Software"), false);
});

test("validates API contracts before workflows reach the database", () => {
  assert.equal(
    createLeaveRequestSchema.safeParse({
      leaveTypeId: "1",
      startDate: "2026-07-23",
      endDate: "2026-07-24",
      reason: "Holiday",
    }).success,
    true,
  );
  assert.equal(
    createLeaveRequestSchema.safeParse({
      leaveTypeId: 1,
      startDate: "23-07-2026",
      endDate: "2026-07-24",
    }).success,
    false,
  );
  assert.equal(
    manualTimeEntrySchema.safeParse({
      clockIn: "2026-07-23T09:00",
      clockOut: "2026-07-23T18:00",
    }).success,
    true,
  );
  assert.equal(
    workScheduleSchema.safeParse({
      workDays: "1,2,3,4,5",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      timezone: "Europe/Kyiv",
    }).success,
    true,
  );
  assert.equal(
    workScheduleSchema.safeParse({
      workDays: "Monday",
      startTime: "9",
      endTime: "18:00",
      breakMinutes: 500,
      timezone: "",
    }).success,
    false,
  );
});

test("keeps personal contacts complete and rejects generic salary storage", () => {
  assert.equal(
    createProfileRecordSchema.safeParse({
      kind: "emergency_contact",
      title: "Contact",
      startedOn: "2026-01-01",
    }).success,
    false,
  );
  assert.equal(
    createProfileRecordSchema.safeParse({
      kind: "emergency_contact",
      title: "Contact",
      subtitle: "Parent",
      notes: "+380000000000",
    }).success,
    true,
  );
  const salary = updateProfileRecordSchema.safeParse({
    recordId: 7,
    kind: "compensation",
    title: "Base salary",
    amount: 2500,
    currency: "USD",
    startedOn: "2026-09-01",
  });
  assert.equal(salary.success, true);
  if (salary.success) assert.equal("amount" in salary.data, false);
  assert.equal(
    compensationSchema.safeParse({
      kind: "base",
      effectiveFrom: "2026-09-01",
      amount: 2500,
      currency: "USD",
      period: "month",
      paymentSchedule: "monthly",
    }).success,
    true,
  );
  for (const invalid of [
    { currency: "GBP" },
    { period: "fortnight" },
    { paymentSchedule: "biweekly" },
    { kind: "bonus" },
  ]) {
    assert.equal(
      compensationSchema.safeParse({
        kind: "base",
        effectiveFrom: "2026-09-01",
        amount: 2500,
        currency: "USD",
        period: "month",
        paymentSchedule: "monthly",
        ...invalid,
      }).success,
      false,
    );
  }
});

test("parses manually entered dates without timezone or overflow drift", () => {
  assert.equal(parseManualDate("31.01.2026"), "2026-01-31");
  assert.equal(parseManualDate("29.02.2024"), "2024-02-29");
  assert.equal(parseManualDate("29.02.2023"), null);
  assert.equal(parseManualDate("31.09.2020"), null);
  assert.equal(parseManualDate("31.02.2026"), null);
  assert.equal(parseManualDate("31.04.2024"), null);
  assert.equal(parseManualDate("01.01.2000"), "2000-01-01");
  assert.equal(parseManualDate("31.12.2099"), "2099-12-31");
  assert.equal(formatManualDate("2026-04-09"), "09.04.2026");
  assert.equal(addCalendarDays("2026-01-01", 1), "2026-01-02");
  assert.equal(addCalendarDays("2026-01-01", -1), "2025-12-31");
  assert.equal(
    calendarMonthDays("2024-02").filter((day) => day.startsWith("2024-02"))
      .length,
    29,
  );
  assert.equal(calendarMonthDays("2024-02").length, 42);
  assert.equal(
    new Date(`${calendarMonthDays("2024-02")[0]}T12:00:00Z`).getUTCDay(),
    1,
  );
  assert.equal(addCalendarMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addCalendarMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addCalendarMonths("2026-02-29", 0), "");
});

test("defaults probation from the employee start date and preserves manual overrides", () => {
  assert.equal(resolveProbationEnd("2026-01-31", undefined, 3), "2026-04-30");
  assert.equal(resolveProbationEnd("2025-12-15", undefined, 3), "2026-03-15");
  assert.equal(
    resolveProbationEnd("2025-12-15", "2026-02-01", 3),
    "2026-02-01",
  );
  assert.equal(resolveProbationEnd("2025-12-15", "", 3), null);

  const legacyDefaults = employeeDefaultsSchema.parse({
    division: "Incora",
    location: "Lviv",
    workMode: "office",
    employmentType: "Full-time",
    timezone: "Europe/Kyiv",
    workDays: "1,2,3,4,5",
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: 60,
  });
  assert.equal(legacyDefaults.probationMonths, 3);
});

test("restricts sensitive employee data to the employee or an explicit grant", () => {
  assert.equal(canReadEmployeeSensitiveData(12, 12, false), true);
  assert.equal(canReadEmployeeSensitiveData(12, 13, true), true);
  assert.equal(canReadEmployeeSensitiveData(12, 13, false), false);
  assert.equal(canReadEmployeeSensitiveData(12, null, false), false);
});

test("HR-only private employee details require an explicit sensitive-data grant", () => {
  assert.equal(canReadEmployeePrivateDetails(false), false);
  assert.equal(canReadEmployeePrivateDetails(true), true);
});

test("counts disjoint previous experience only before the current employment", () => {
  assert.equal(
    calculatePreviousExperienceDays(
      [
        { startedOn: "2020-01-01", endedOn: "2021-01-01" },
        { startedOn: "2020-06-01", endedOn: "2021-06-01" },
        { startedOn: "2023-01-01", endedOn: "2027-01-01" },
      ],
      "2024-01-01",
    ),
    882,
  );
  assert.equal(calculatePreviousExperienceDays([], "2024-01-01"), null);
  assert.equal(
    calculatePreviousExperienceDays(
      [{ startedOn: "not-a-date", endedOn: "2020-01-01" }],
      "2024-01-01",
    ),
    null,
  );
});

test("collapses duplicate employment snapshots without hiding real changes", () => {
  const baseline = {
    jobTitle: "Engineer",
    level: "Middle",
    managerId: 1,
    location: "Lviv",
    division: "Ukraine",
    department: "Engineering",
    team: "Platform",
    employmentType: "Full-time",
    status: "active",
    changeReason: "Profile update",
  };
  const snapshots = [
    { ...baseline, id: 3, effectiveDate: "2026-03-01" },
    { ...baseline, id: 2, effectiveDate: "2026-02-01" },
    { ...baseline, id: 1, effectiveDate: "2026-01-01" },
    {
      ...baseline,
      id: 4,
      effectiveDate: "2026-04-01",
      jobTitle: "Senior Engineer",
    },
  ];
  assert.equal(
    employmentStateKey(snapshots[0]),
    employmentStateKey(snapshots[1]),
  );
  assert.deepEqual(
    collapseEmploymentSnapshots(snapshots).map((item) => item.id),
    [1, 4],
  );
  assert.equal(
    latestEmploymentStateChangeDate(snapshots, "2020-01-01"),
    "2026-04-01",
  );
  assert.equal(
    latestEmploymentStateChangeDate(
      [{ ...baseline, id: 8, effectiveDate: "2025-06-01" }],
      "2020-01-01",
    ),
    "2025-06-01",
  );
});

test("employment changes cannot rewind state and inactive employees require rehire", () => {
  const snapshots = [
    {
      id: 1,
      effectiveDate: "2026-07-01",
      jobTitle: "Junior",
      level: "Junior",
      managerId: null,
      location: "Lviv",
      division: "Engineering",
      department: "Platform",
      team: "Web",
      employmentType: "Full-time",
      status: "active",
      changeReason: "Hire",
    },
    {
      id: 2,
      effectiveDate: "2026-09-01",
      jobTitle: "Senior",
      level: "Senior",
      managerId: null,
      location: "Lviv",
      division: "Engineering",
      department: "Platform",
      team: "Web",
      employmentType: "Full-time",
      status: "active",
      changeReason: "Promotion",
    },
  ];
  const latest = latestEmploymentStateChangeDate(snapshots, "2026-07-01");
  assert.equal(latest, "2026-09-01");
  assert.equal(
    employmentChangeConflict({
      status: "active",
      effectiveDate: "2026-08-01",
      latestStateChangeDate: latest,
    }),
    "backdated",
  );
  assert.equal(
    employmentChangeConflict({
      status: "active",
      effectiveDate: "2026-09-01",
      latestStateChangeDate: latest,
    }),
    null,
  );
  assert.equal(
    employmentChangeConflict({
      status: "active",
      effectiveDate: "2026-09-30",
      latestStateChangeDate: latest,
    }),
    null,
  );
  assert.equal(
    employmentChangeConflict({
      status: "inactive",
      effectiveDate: "2026-09-30",
      latestStateChangeDate: latest,
    }),
    "inactive",
  );
});

test("employee edit DTO omits sensitive values without explicit permission", () => {
  const employee = {
    id: 4,
    firstName: "Test",
    lastName: "Person",
    email: "test@example.test",
    jobTitle: "Engineer",
    department: "Platform",
    employmentType: "Full-time",
    status: "active",
    startDate: "2024-01-01",
    managerId: null,
    employeeCode: "T-004",
    ukrainianName: null,
    division: "Engineering",
    team: null,
    level: "Senior",
    probationEnd: null,
    location: "Lviv",
    divisionUnitId: 1,
    departmentUnitId: 2,
    teamUnitId: null,
    personalEmail: "private@example.test",
    phone: "+380000000000",
    birthDate: "1990-01-01",
    gender: "Female",
    address: "Private address",
  };
  const safe = toEmployeeEditDto(employee, false);
  for (const field of [
    "personalEmail",
    "phone",
    "birthDate",
    "gender",
    "address",
  ]) {
    assert.equal(Object.hasOwn(safe, field), false);
  }
  assert.equal(
    toEmployeeEditDto(employee, true).personalEmail,
    employee.personalEmail,
  );
});

test("sensitive employee PATCH fields fail closed without viewSensitiveData", () => {
  const response = sensitiveEmployeeMutationResponse(
    { personalEmail: "private@example.test", jobTitle: "Engineer" },
    false,
  );
  assert.equal(response.status, 403);
  assert.equal(
    sensitiveEmployeeMutationResponse({ jobTitle: "Engineer" }, false),
    null,
  );
  assert.equal(
    sensitiveEmployeeMutationResponse({ passportNumber: "secret" }, true),
    null,
  );
});

test("employment timeline uses historical hire state and emits termination once", () => {
  const junior = {
    jobTitle: "Junior Developer",
    level: "Junior",
    managerId: 11,
    location: "Lviv",
    division: "Engineering",
    department: "Platform",
    team: "Web",
    employmentType: "Full-time",
    status: "active",
  };
  const senior = { ...junior, jobTitle: "Senior Developer", level: "Senior" };
  const timeline = buildEmploymentTimeline({
    startDate: "2023-01-02",
    probationEnd: "2023-04-02",
    currentState: senior,
    snapshots: [
      { ...junior, id: 1, effectiveDate: "2023-01-02", changeReason: "Hire" },
      {
        ...senior,
        id: 2,
        effectiveDate: "2025-03-01",
        changeReason: "Promotion",
      },
      {
        ...senior,
        id: 3,
        effectiveDate: "2026-06-30",
        status: "inactive",
        changeReason: "Employment ended: project completed",
      },
    ],
    termination: {
      lastWorkingDay: "2026-06-30",
      terminationType: "project_completed",
    },
  });
  assert.equal(timeline.at(-1).kind, "hired");
  assert.equal(timeline.at(-1).state.jobTitle, "Junior Developer");
  assert.equal(timeline.at(-1).state.level, "Junior");
  assert.equal(timeline.filter((item) => item.kind === "hired").length, 1);
  assert.equal(timeline.filter((item) => item.kind === "probation").length, 1);
  assert.deepEqual(
    timeline.map((item) => [item.kind, item.date]),
    [
      ["termination", "2026-06-30"],
      ["change", "2025-03-01"],
      ["probation", "2023-04-02"],
      ["hired", "2023-01-02"],
    ],
  );
  assert.equal(
    timeline.filter((item) => item.kind === "termination").length,
    1,
  );
  assert.equal(timeline[0].kind, "termination");
  assert.equal(
    timeline.filter((item) => item.kind === "termination").length,
    1,
  );
  assert.equal(timeline[1].kind, "change");
  assert.equal(timeline[1].state.jobTitle, "Senior Developer");
});

test("employment timeline orders same-day events Termination, Change, Probation, Hired", () => {
  const junior = {
    jobTitle: "Junior Developer",
    level: "Junior",
    managerId: null,
    location: "Lviv",
    division: "Engineering",
    department: "Platform",
    team: null,
    employmentType: "Full-time",
    status: "active",
  };
  const timeline = buildEmploymentTimeline({
    startDate: "2023-01-02",
    probationEnd: "2023-01-02",
    currentState: { ...junior, jobTitle: "Senior Developer", level: "Senior" },
    snapshots: [
      { ...junior, id: 1, effectiveDate: "2023-01-02", changeReason: "Hire" },
      {
        ...junior,
        id: 2,
        jobTitle: "Senior Developer",
        level: "Senior",
        effectiveDate: "2023-01-02",
        changeReason: "Same-day promotion",
      },
      {
        ...junior,
        id: 3,
        status: "inactive",
        effectiveDate: "2023-01-02",
        changeReason: "Employment ended: project completed",
      },
    ],
    termination: {
      lastWorkingDay: "2023-01-02",
      terminationType: "project_completed",
    },
  });
  assert.deepEqual(
    timeline.map((item) => item.kind),
    ["termination", "change", "probation", "hired"],
  );
});

test("employment timeline displays newest first and preserves historical hire state", () => {
  const junior = {
    jobTitle: "Junior Developer",
    level: "Junior",
    managerId: 11,
    location: "Lviv",
    division: "Engineering",
    department: "Platform",
    team: "Web",
    employmentType: "Full-time",
    status: "active",
  };
  const middle = { ...junior, jobTitle: "Middle Developer", level: "Middle" };
  const lead = { ...junior, jobTitle: "Lead Developer", level: "Lead" };
  const timeline = buildEmploymentTimeline({
    startDate: "2024-02-19",
    probationEnd: "2024-05-19",
    currentState: lead,
    snapshots: [
      { ...junior, id: 1, effectiveDate: "2024-02-19", changeReason: "Hire" },
      {
        ...middle,
        id: 2,
        effectiveDate: "2025-03-01",
        changeReason: "Position change",
      },
      {
        ...lead,
        id: 3,
        effectiveDate: "2026-09-01",
        changeReason: "Position change",
      },
    ],
  });

  assert.deepEqual(
    timeline.map((item) => item.date),
    ["2026-09-01", "2025-03-01", "2024-05-19", "2024-02-19"],
  );
  assert.equal(timeline.filter((item) => item.kind === "hired").length, 1);
  assert.equal(
    timeline.filter((item) => item.kind === "termination").length,
    0,
  );
  assert.equal(timeline[0].state.jobTitle, "Lead Developer");
  assert.equal(timeline[1].state.jobTitle, "Middle Developer");
  assert.equal(timeline.at(-1).state.jobTitle, "Junior Developer");
});

test("employment timeline only falls back to current state when snapshots are absent", () => {
  const timeline = buildEmploymentTimeline({
    startDate: "2023-01-02",
    currentState: {
      jobTitle: "Current Role",
      level: "Senior",
      managerId: null,
      location: "Lviv",
      division: "Engineering",
      department: "Platform",
      team: null,
      employmentType: "Full-time",
      status: "active",
    },
    snapshots: [],
  });
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].state.jobTitle, "Current Role");
});

test("employment timeline preserves canonical hire, rehire and termination history without period records", () => {
  const firstRole = {
    jobTitle: "Analyst",
    level: "Middle",
    managerId: null,
    location: "Kyiv",
    division: "Operations",
    department: "People",
    team: null,
    employmentType: "Full-time",
    status: "active",
  };
  const rehiredRole = { ...firstRole, jobTitle: "People Lead", level: "Lead" };
  const timeline = buildEmploymentTimeline({
    startDate: "2024-04-01",
    currentState: { ...rehiredRole, status: "inactive" },
    snapshots: [
      {
        ...firstRole,
        id: 1,
        effectiveDate: "2020-01-01",
        changeReason: "Employee created",
      },
      {
        ...firstRole,
        id: 2,
        effectiveDate: "2022-12-31",
        status: "inactive",
        changeReason: "Employment ended: resignation",
      },
      {
        ...rehiredRole,
        id: 3,
        effectiveDate: "2024-04-01",
        changeReason: "Employee rehired",
      },
      {
        ...rehiredRole,
        id: 4,
        effectiveDate: "2025-01-01",
        status: "inactive",
        changeReason: "Employment ended: resignation",
      },
    ],
    terminations: [
      { lastWorkingDay: "2022-12-31", terminationType: "resignation" },
      { lastWorkingDay: "2025-01-01", terminationType: "resignation" },
    ],
  });
  assert.deepEqual(
    timeline.map((item) => [item.kind, item.date]),
    [
      ["termination", "2025-01-01"],
      ["hired", "2024-04-01"],
      ["termination", "2022-12-31"],
      ["hired", "2020-01-01"],
    ],
  );
  assert.equal(timeline.filter((item) => item.kind === "hired").length, 2);
  assert.equal(
    timeline.filter((item) => item.kind === "termination").length,
    2,
  );
  assert.equal(timeline[1].state.jobTitle, "People Lead");
  assert.equal(timeline.at(-1).state.jobTitle, "Analyst");
});

test("compensation file authorization binds owner and sensitive access", () => {
  const common = {
    fileOwnerEmployeeId: 7,
    compensationOwnerEmployeeId: 7,
  };
  assert.equal(
    canReadCompensationAttachment({
      ...common,
      viewerEmployeeId: 7,
      viewSensitiveData: false,
    }),
    true,
  );
  assert.equal(
    canReadCompensationAttachment({
      ...common,
      viewerEmployeeId: 8,
      viewSensitiveData: true,
    }),
    true,
  );
  assert.equal(
    canReadCompensationAttachment({
      ...common,
      viewerEmployeeId: 8,
      viewSensitiveData: false,
    }),
    false,
  );
  assert.equal(
    canReadCompensationAttachment({
      ...common,
      fileOwnerEmployeeId: 9,
      viewerEmployeeId: 7,
      viewSensitiveData: false,
    }),
    false,
  );
});

test("compensation attachment grouping preserves every file per record", () => {
  const grouped = groupCompensationAttachments([
    { compensationId: "22", id: "file-a", name: "contract.pdf" },
    { compensationId: "22", id: "file-b", name: "amendment.pdf" },
    { compensationId: "23", id: "file-c", name: "bonus.pdf" },
  ]);
  assert.deepEqual(grouped.get("22"), [
    { id: "file-a", name: "contract.pdf" },
    { id: "file-b", name: "amendment.pdf" },
  ]);
  assert.deepEqual(grouped.get("23"), [{ id: "file-c", name: "bonus.pdf" }]);
});

test("inventory permissions are least-privilege and quantity/date rules are strict", () => {
  assert.equal(canManageInventory("super_admin", false), true);
  assert.equal(canManageInventory("hr_admin", true), true);
  assert.equal(canManageInventory("hr_admin", false), false);
  assert.equal(canManageInventory("manager", true), false);
  assert.equal(canManageInventory("employee", true), false);

  assert.equal(calculateStockDelta("receipt", 4), 4);
  assert.equal(calculateStockDelta("decrease", 4), -4);
  assert.equal(calculateStockDelta("transfer", 4), 4);
  assert.equal(calculateStockDelta("receipt", 0), null);
  assert.equal(applyInventoryDelta(3, -3), 0);
  assert.equal(applyInventoryDelta(3, -4), null);
  assert.equal(isBelowInventoryMinimum(2, 3), true);
  assert.equal(isBelowInventoryMinimum(0, 0), false);

  assert.equal(isValidInventoryDate("2024-02-29"), true);
  assert.equal(isValidInventoryDate("2023-02-29"), false);
  assert.equal(isValidInventoryDate("2024-02-31"), false);
  assert.equal(isValidInventoryDate("2024-04-31"), false);
  assert.equal(isValidInventoryDate("2026-10-27"), true);
});

test("timer start labels use the employee timezone across seasons and midnight", () => {
  assert.equal(
    formatTimeInZone("2026-11-23T08:00:00.000Z", "Europe/Kyiv"),
    "10:00",
  );
  assert.equal(
    formatTimeInZone("2026-07-23T07:00:00.000Z", "Europe/Kyiv"),
    "10:00",
  );
  assert.equal(
    formatTimeInZone("2026-11-23T22:30:00.000Z", "Europe/Kyiv"),
    "00:30",
  );
  assert.equal(
    formatTimeInZone("2026-11-23T08:00:00.000Z", "America/New_York"),
    "03:00",
  );
});
