import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  employees,
  companyHolidays,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  workSchedules,
} from "@/db/schema";
import { hasOrganizationScope, type CurrentUser } from "@/lib/auth";
import { getDateContext, type DateContext } from "@/modules/shared/date";
import { getEmployeeTimezone } from "@/modules/time/periods";

export async function getLeaveOverview(
  employeeId: number,
  user: CurrentUser,
  requestedDate?: DateContext,
) {
  const db = getDb();
  const [schedule] = await db
    .select({
      workDays: workSchedules.workDays,
      timezone: workSchedules.timezone,
    })
    .from(workSchedules)
    .where(eq(workSchedules.employeeId, employeeId))
    .limit(1);
  const timezone = await getEmployeeTimezone(employeeId);
  const date = requestedDate ?? getDateContext(new Date(), timezone);
  const balances = await db
    .select({
      id: leaveBalances.id,
      leaveTypeId: leaveTypes.id,
      code: leaveTypes.code,
      name: leaveTypes.name,
      color: leaveTypes.color,
      allowance: leaveBalances.allowance,
      used: leaveBalances.used,
      adjustment: leaveBalances.adjustment,
    })
    .from(leaveBalances)
    .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
    .where(
      and(
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.year, date.year),
      ),
    )
    .orderBy(leaveTypes.id);

  const holidays = await db
    .select({ date: companyHolidays.date, name: companyHolidays.name })
    .from(companyHolidays)
    .where(
      and(
        sql`${companyHolidays.date} >= ${`${date.year}-01-01`}`,
        sql`${companyHolidays.date} <= ${`${date.year}-12-31`}`,
      ),
    )
    .orderBy(companyHolidays.date);

  const requests = await db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      leaveTypeId: leaveRequests.leaveTypeId,
      typeName: leaveTypes.name,
      typeCode: leaveTypes.code,
      color: leaveTypes.color,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      reviewerEmail: leaveRequests.reviewerEmail,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(eq(leaveRequests.employeeId, employeeId))
    .orderBy(desc(leaveRequests.startDate), desc(leaveRequests.id));

  const pendingQuery = db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      managerId: employees.managerId,
      typeName: leaveTypes.name,
      color: leaveTypes.color,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id));

  const pending = hasOrganizationScope(user)
    ? await pendingQuery
        .where(
          and(
            eq(leaveRequests.status, "pending"),
            // A person must never be offered their own request as an
            // approval task, even when their role can review the organization.
            ne(leaveRequests.employeeId, user.employeeId ?? -1),
          ),
        )
        .orderBy(leaveRequests.startDate)
    : user.role === "manager"
      ? await pendingQuery
          .where(
            and(
              eq(leaveRequests.status, "pending"),
              eq(employees.managerId, user.employeeId ?? -1),
            ),
          )
          .orderBy(leaveRequests.startDate)
      : [];

  return {
    balances,
    requests,
    pending,
    holidays,
    workDays: schedule?.workDays ?? "1,2,3,4,5",
  };
}

export function getLeaveCalendar() {
  return getDb()
    .select({
      id: leaveRequests.id,
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      department: employees.department,
      typeName: leaveTypes.name,
      color: leaveTypes.color,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(eq(leaveRequests.status, "approved"))
    .orderBy(leaveRequests.startDate);
}
