import { and, desc, eq, getTableColumns, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  employmentHistory,
  employeeTerminations,
  employeeProfileRecords,
  employeePrivateDetails,
  employees,
  orgUnits,
  protectedAdminAccounts,
  referenceValues,
  storedFiles,
  workModeEntries,
  workSchedules,
  users,
} from "@/db/schema";
import { getDateContext } from "@/modules/shared/date";
import { getEmployeeDefaults } from "@/modules/settings/system";

export function getEmployeeDirectory(
  options: { includeInactive?: boolean } = {},
) {
  const { today } = getDateContext();
  return getDb()
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      jobTitle: employees.jobTitle,
      employmentType: employees.employmentType,
      level: employees.level,
      department: employees.department,
      division: employees.division,
      team: employees.team,
      location: employees.location,
      managerName: sql<string | null>`(
        SELECT manager.first_name || ' ' || manager.last_name
        FROM employees manager
        WHERE manager.id = ${employees.managerId}
      )`.as("manager_name"),
      startDate: employees.startDate,
      workMode: sql<
        "office" | "remote"
      >`coalesce(${workModeEntries.mode}, ${employees.defaultWorkMode})`.as(
        "work_mode",
      ),
      status: employees.status,
      probationEnd: employees.probationEnd,
      lifecycleStatus: sql<
        "working" | "probation" | "terminated" | "on_leave"
      >`CASE
        WHEN ${employees.status} = 'inactive' THEN 'terminated'
        WHEN ${employees.status} = 'on_leave' THEN 'on_leave'
        WHEN ${employees.probationEnd} IS NOT NULL
          AND ${employees.probationEnd} >= ${today}
          THEN 'probation'
        ELSE 'working'
      END`.as("lifecycle_status"),
      managerId: employees.managerId,
      technologies: sql<string | null>`(
        SELECT group_concat(${employeeProfileRecords.title}, ', ')
        FROM ${employeeProfileRecords}
        WHERE ${employeeProfileRecords.employeeId} = ${employees.id}
          AND ${employeeProfileRecords.kind} = 'skill'
      )`.as("technologies"),
      lastWorkingDay: sql<string | null>`(
        SELECT ${employeeTerminations.lastWorkingDay}
        FROM ${employeeTerminations}
        WHERE ${employeeTerminations.employeeId} = ${employees.id}
        ORDER BY ${employeeTerminations.lastWorkingDay} DESC, ${employeeTerminations.id} DESC
        LIMIT 1
      )`.as("last_working_day"),
      terminationType: sql<string | null>`(
        SELECT ${employeeTerminations.terminationType}
        FROM ${employeeTerminations}
        WHERE ${employeeTerminations.employeeId} = ${employees.id}
        ORDER BY ${employeeTerminations.lastWorkingDay} DESC, ${employeeTerminations.id} DESC
        LIMIT 1
      )`.as("termination_type"),
      terminationReasons: sql<string | null>`(
        SELECT ${employeeTerminations.reasonCodesJson}
        FROM ${employeeTerminations}
        WHERE ${employeeTerminations.employeeId} = ${employees.id}
        ORDER BY ${employeeTerminations.lastWorkingDay} DESC, ${employeeTerminations.id} DESC
        LIMIT 1
      )`.as("termination_reasons"),
      rehireEligible: sql<boolean | null>`(
        SELECT ${employeeTerminations.rehireEligible}
        FROM ${employeeTerminations}
        WHERE ${employeeTerminations.employeeId} = ${employees.id}
        ORDER BY ${employeeTerminations.lastWorkingDay} DESC, ${employeeTerminations.id} DESC
        LIMIT 1
      )`
        .mapWith((value) => (value === null ? null : Boolean(value)))
        .as("rehire_eligible"),
      photoFileId: sql<string | null>`(
        SELECT ${storedFiles.id}
        FROM ${storedFiles}
        WHERE ${storedFiles.ownerEmployeeId} = ${employees.id}
          AND ${storedFiles.kind} = 'profile_photo'
        ORDER BY ${storedFiles.createdAt} DESC
        LIMIT 1
      )`.as("photo_file_id"),
    })
    .from(employees)
    .leftJoin(
      workModeEntries,
      and(
        eq(workModeEntries.employeeId, employees.id),
        eq(workModeEntries.workDate, today),
      ),
    )
    .where(
      options.includeInactive
        ? undefined
        : sql`${employees.status} <> 'inactive'`,
    )
    .orderBy(employees.firstName);
}

export function getEmployeeTermination(employeeId: number) {
  return getDb()
    .select()
    .from(employeeTerminations)
    .where(eq(employeeTerminations.employeeId, employeeId))
    .orderBy(
      desc(employeeTerminations.lastWorkingDay),
      desc(employeeTerminations.id),
    );
}

export async function getEmployeeAccountAccess(employeeId: number) {
  const [account] = await getDb()
    .select({
      userId: users.id,
      enabled: users.enabled,
      email: users.email,
      role: users.role,
      linkedAccountCount: sql<number>`COUNT(*) OVER ()`,
      protectedAdmin: sql<number>`CASE WHEN ${protectedAdminAccounts.userId} IS NULL THEN 0 ELSE 1 END`,
    })
    .from(users)
    .leftJoin(
      protectedAdminAccounts,
      eq(protectedAdminAccounts.userId, users.id),
    )
    .where(eq(users.employeeId, employeeId))
    .limit(1);
  return account ?? null;
}

export function getEmployeeManagerOptions() {
  return getDb()
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      jobTitle: employees.jobTitle,
    })
    .from(employees)
    .orderBy(employees.firstName);
}

export async function getEmployee(id: number, includeSensitive = true) {
  const [employee] = await getDb()
    .select({
      ...getTableColumns(employees),
      personalEmail: includeSensitive
        ? employees.personalEmail
        : sql<string | null>`NULL`.as("personal_email"),
      phone: includeSensitive
        ? employees.phone
        : sql<string | null>`NULL`.as("phone"),
      birthDate: includeSensitive
        ? employees.birthDate
        : sql<string | null>`NULL`.as("birth_date"),
      gender: includeSensitive
        ? employees.gender
        : sql<string | null>`NULL`.as("gender"),
      address: includeSensitive
        ? employees.address
        : sql<string | null>`NULL`.as("address"),
    })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  if (!employee?.managerId) return employee;
  const [manager] = await getDb()
    .select({ firstName: employees.firstName, lastName: employees.lastName })
    .from(employees)
    .where(eq(employees.id, employee.managerId))
    .limit(1);
  return {
    ...employee,
    managerName: manager ? `${manager.firstName} ${manager.lastName}` : null,
  };
}

export async function employeeExists(id: number) {
  const [employee] = await getDb()
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  return Boolean(employee);
}

export function getEmployeeHistory(id: number) {
  return getDb()
    .select()
    .from(employmentHistory)
    .where(eq(employmentHistory.employeeId, id))
    .orderBy(desc(employmentHistory.effectiveDate), desc(employmentHistory.id));
}

export function getEmployeeProfileRecords(
  id: number,
  includeSensitive: boolean,
) {
  const visibleKinds = [
    "skill",
    "education",
    "certification",
    "experience",
    "emergency_contact",
    "dependent",
  ];
  return getDb()
    .select({
      id: employeeProfileRecords.id,
      employeeId: employeeProfileRecords.employeeId,
      kind: employeeProfileRecords.kind,
      referenceValueId: employeeProfileRecords.referenceValueId,
      title: employeeProfileRecords.title,
      subtitle: employeeProfileRecords.subtitle,
      startedOn: employeeProfileRecords.startedOn,
      endedOn: employeeProfileRecords.endedOn,
      notes: employeeProfileRecords.notes,
      createdAt: employeeProfileRecords.createdAt,
      attachmentFileId: sql<string | null>`(
        SELECT ${storedFiles.id}
        FROM ${storedFiles}
        WHERE ${storedFiles.relatedEntityType} = 'employee_profile_record'
          AND ${storedFiles.relatedEntityId} = CAST(${employeeProfileRecords.id} AS TEXT)
        ORDER BY ${storedFiles.createdAt} DESC
        LIMIT 1
      )`.as("attachment_file_id"),
      attachmentName: sql<string | null>`(
        SELECT ${storedFiles.originalName}
        FROM ${storedFiles}
        WHERE ${storedFiles.relatedEntityType} = 'employee_profile_record'
          AND ${storedFiles.relatedEntityId} = CAST(${employeeProfileRecords.id} AS TEXT)
        ORDER BY ${storedFiles.createdAt} DESC
        LIMIT 1
      )`.as("attachment_name"),
    })
    .from(employeeProfileRecords)
    .where(
      and(
        eq(employeeProfileRecords.employeeId, id),
        sql`${employeeProfileRecords.kind} IN (${sql.join(
          (includeSensitive ? visibleKinds : visibleKinds.slice(0, 4)).map(
            (kind) => sql`${kind}`,
          ),
          sql`, `,
        )})`,
      ),
    )
    .orderBy(desc(employeeProfileRecords.createdAt));
}

export async function getEmployeePrivateDetails(employeeId: number) {
  const [details] = await getDb()
    .select({
      taxCode: employeePrivateDetails.taxCode,
      contractEndDate: employeePrivateDetails.contractEndDate,
      passportNumber: employeePrivateDetails.passportNumber,
      passportDate: employeePrivateDetails.passportDate,
      passportAuthority: employeePrivateDetails.passportAuthority,
      legalEntityValueId: employeePrivateDetails.legalEntityValueId,
      legalEntity: referenceValues.label,
    })
    .from(employeePrivateDetails)
    .leftJoin(
      referenceValues,
      and(
        eq(employeePrivateDetails.legalEntityValueId, referenceValues.id),
        eq(referenceValues.kind, "legal_entity"),
      ),
    )
    .where(eq(employeePrivateDetails.employeeId, employeeId))
    .limit(1);
  return details ?? null;
}

export async function getEmployeeProfileRelationships(employeeId: number) {
  const db = getDb();
  const photoFileId = sql<string | null>`(
    SELECT ${storedFiles.id} FROM ${storedFiles}
    WHERE ${storedFiles.ownerEmployeeId} = ${employees.id}
      AND ${storedFiles.kind} = 'profile_photo'
    ORDER BY ${storedFiles.createdAt} DESC LIMIT 1
  )`.as("photo_file_id");
  const fields = {
    id: employees.id,
    firstName: employees.firstName,
    lastName: employees.lastName,
    jobTitle: employees.jobTitle,
    department: employees.department,
    photoFileId,
  };
  const [employee] = await db
    .select({
      managerId: employees.managerId,
      teamUnitId: employees.teamUnitId,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!employee) return { manager: null, directReports: [], teammates: [] };
  const [managerRows, directReports, teammates] = await Promise.all([
    employee.managerId
      ? db
          .select(fields)
          .from(employees)
          .where(eq(employees.id, employee.managerId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select(fields)
      .from(employees)
      .where(
        and(
          eq(employees.managerId, employeeId),
          eq(employees.status, "active"),
        ),
      )
      .orderBy(employees.firstName, employees.lastName),
    employee.teamUnitId
      ? db
          .select(fields)
          .from(employees)
          .where(
            and(
              eq(employees.teamUnitId, employee.teamUnitId),
              ne(employees.id, employeeId),
              eq(employees.status, "active"),
            ),
          )
          .orderBy(employees.firstName, employees.lastName)
      : Promise.resolve([]),
  ]);
  return { manager: managerRows[0] ?? null, directReports, teammates };
}

export async function getEffectiveWorkSchedule(employeeId: number) {
  const [schedule] = await getDb()
    .select({
      timezone: workSchedules.timezone,
      workDays: workSchedules.workDays,
      startTime: workSchedules.startTime,
      endTime: workSchedules.endTime,
      breakMinutes: workSchedules.breakMinutes,
    })
    .from(workSchedules)
    .where(eq(workSchedules.employeeId, employeeId))
    .limit(1);
  if (schedule) return { ...schedule, source: "employee" as const };
  const defaults = await getEmployeeDefaults();
  return { ...defaults, source: "default" as const };
}

export function getOrgPeople() {
  return getDb()
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      jobTitle: employees.jobTitle,
      department: employees.department,
      managerId: employees.managerId,
      status: employees.status,
      photoFileId: sql<string | null>`(
        SELECT ${storedFiles.id}
        FROM ${storedFiles}
        WHERE ${storedFiles.ownerEmployeeId} = ${employees.id}
          AND ${storedFiles.kind} = 'profile_photo'
        ORDER BY ${storedFiles.createdAt} DESC
        LIMIT 1
      )`.as("photo_file_id"),
    })
    .from(employees)
    .orderBy(employees.firstName);
}

export function getOrgUnits() {
  return getDb()
    .select()
    .from(orgUnits)
    .where(eq(orgUnits.active, true))
    .orderBy(orgUnits.sortOrder, orgUnits.id);
}

export function getReferenceValues() {
  return getDb()
    .select()
    .from(referenceValues)
    .where(eq(referenceValues.active, true))
    .orderBy(
      referenceValues.kind,
      referenceValues.sortOrder,
      referenceValues.label,
    );
}
