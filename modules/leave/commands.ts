import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  companyHolidays,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  workSchedules,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { getApprovalRecipientEmails } from "@/modules/approvals/recipients";
import {
  buildInAppNotificationStatements,
  buildPushNotificationStatements,
} from "@/modules/notifications/outbox";
import type { CreateLeaveRequestInput } from "@/modules/leave/contracts";
import {
  countWorkdays,
  validateDailyAllocations,
} from "@/modules/leave/domain";
import { ApplicationError } from "@/modules/shared/application-error";
import { yearFromDate } from "@/modules/shared/date";

export async function createLeaveRequest(
  user: CurrentUser,
  input: CreateLeaveRequestInput,
) {
  if (!user.employeeId) {
    throw new ApplicationError(
      "Your account is not linked to an employee.",
      403,
      "employee_account_required",
    );
  }

  const startYear = yearFromDate(input.startDate);
  const endYear = yearFromDate(input.endDate);
  if (!startYear || startYear !== endYear) {
    throw new ApplicationError(
      "Choose a valid leave date range within one calendar year.",
      400,
      "invalid_leave_range",
    );
  }

  const db = getDb();
  const idempotencyKey = input.idempotencyKey?.trim().slice(0, 160) || null;
  // Keep a stable server-side key for atomic insert/audit/notification
  // batches even when the request came from an older client.
  const commandKey = idempotencyKey ?? crypto.randomUUID();
  if (idempotencyKey) {
    const [existing] = await db
      .select({ request: leaveRequests, type: leaveTypes })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
      .where(
        and(
          eq(leaveRequests.employeeId, user.employeeId),
          eq(leaveRequests.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing)
      return {
        ...existing.request,
        typeName: existing.type.name,
        typeCode: existing.type.code,
        color: existing.type.color,
      };
  }
  const holidayRows = await db
    .select({ date: companyHolidays.date })
    .from(companyHolidays)
    .where(
      and(
        gte(companyHolidays.date, input.startDate),
        lte(companyHolidays.date, input.endDate),
      ),
    );
  const [schedule] = await db
    .select({ workDays: workSchedules.workDays })
    .from(workSchedules)
    .where(eq(workSchedules.employeeId, user.employeeId))
    .limit(1);
  const scheduledDays = new Set(
    (schedule?.workDays ?? "1,2,3,4,5").split(",").map(Number),
  );
  const countedDays = countWorkdays(
    input.startDate,
    input.endDate,
    new Set(holidayRows.map((holiday) => holiday.date)),
    scheduledDays,
  );
  if (countedDays <= 0) {
    throw new ApplicationError(
      "This range contains no working days.",
      400,
      "leave_range_has_no_workdays",
    );
  }
  if (
    input.duration === "half" &&
    input.startDate !== input.endDate &&
    !input.dailyAllocations
  ) {
    throw new ApplicationError(
      "A half-day request must start and end on the same date.",
      400,
      "half_day_requires_single_date",
    );
  }
  let dailyAllocations: { date: string; amount: 0 | 0.5 | 1 }[] | null = null;
  let days = input.duration === "half" ? 0.5 : countedDays;
  if (input.dailyAllocations) {
    const allocationResult = validateDailyAllocations(
      input.startDate,
      input.endDate,
      input.dailyAllocations,
      new Set(holidayRows.map((holiday) => holiday.date)),
      scheduledDays,
    );
    if (!allocationResult.ok) {
      throw new ApplicationError(
        "Daily leave amounts must cover the selected working-date range.",
        400,
        `invalid_daily_leave_${allocationResult.error}`,
      );
    }
    dailyAllocations = allocationResult.dates;
    days = allocationResult.total;
  }

  const [[type], [balance], [overlap], [reserved]] = await Promise.all([
    db
      .select()
      .from(leaveTypes)
      .where(eq(leaveTypes.id, input.leaveTypeId))
      .limit(1),
    db
      .select()
      .from(leaveBalances)
      .where(
        and(
          eq(leaveBalances.employeeId, user.employeeId),
          eq(leaveBalances.leaveTypeId, input.leaveTypeId),
          eq(leaveBalances.year, startYear),
        ),
      )
      .limit(1),
    db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, user.employeeId),
          lte(leaveRequests.startDate, input.endDate),
          gte(leaveRequests.endDate, input.startDate),
          or(
            eq(leaveRequests.status, "pending"),
            eq(leaveRequests.status, "approved"),
          ),
        ),
      )
      .limit(1),
    db
      .select({ days: sql<number>`coalesce(sum(${leaveRequests.days}), 0)` })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, user.employeeId),
          eq(leaveRequests.leaveTypeId, input.leaveTypeId),
          eq(leaveRequests.status, "pending"),
          sql`${leaveRequests.startDate} LIKE ${`${startYear}-%`}`,
        ),
      ),
  ]);

  if (!type || !balance) {
    throw new ApplicationError(
      "Leave balance is unavailable.",
      404,
      "leave_balance_missing",
    );
  }
  if (overlap) {
    throw new ApplicationError(
      "This request overlaps another pending or approved leave.",
      409,
      "leave_overlap",
    );
  }

  const available =
    balance.allowance +
    balance.adjustment -
    balance.used -
    Number(reserved?.days ?? 0);
  if (type.code !== "unpaid" && days > available) {
    throw new ApplicationError(
      `Only ${available} days are available for ${type.name}.`,
      409,
      "insufficient_leave_balance",
    );
  }

  const recipientEmails = type.requiresApproval
    ? await getApprovalRecipientEmails(user.employeeId, "leave")
    : [];
  // A configured leave type only waits when there is an actual person who can
  // review it. This prevents requests from becoming permanently pending when
  // no manager/HR approver is configured, while preserving approval workflows
  // whenever a recipient exists.
  const requiresApproval = type.requiresApproval && recipientEmails.length > 0;
  const message = `${user.email} requested ${days} ${type.name} day${days === 1 ? "" : "s"}.`;
  const d1 = getD1();
  const statements = [
    d1
      .prepare(
        `INSERT INTO leave_requests
           (employee_id, leave_type_id, start_date, end_date, days, reason,
            idempotency_key, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.employeeId,
        input.leaveTypeId,
        input.startDate,
        input.endDate,
        days,
        input.reason,
        commandKey,
        requiresApproval ? "pending" : "approved",
      ),
  ];
  if (dailyAllocations) {
    statements.push(
      ...dailyAllocations.map((allocation) =>
        d1
          .prepare(
            `INSERT INTO leave_request_days(request_id, leave_date, amount)
             SELECT id, ?, ?
             FROM leave_requests
             WHERE employee_id=? AND idempotency_key=?
             LIMIT 1`,
          )
          .bind(
            allocation.date,
            allocation.amount,
            user.employeeId,
            commandKey,
          ),
      ),
    );
  }
  statements.push(
    d1
      .prepare(
        `INSERT INTO audit_events
           (actor_email, action, entity_type, entity_id, details)
         SELECT ?, 'leave.requested', 'leave_request', CAST(id AS TEXT), ?
         FROM leave_requests
         WHERE employee_id=? AND idempotency_key=?
         LIMIT 1`,
      )
      .bind(
        user.email,
        `${type.name}: ${input.startDate}–${input.endDate}`,
        user.employeeId,
        commandKey,
      ),
  );
  if (recipientEmails.length) {
    statements.push(
      ...buildInAppNotificationStatements(d1, recipientEmails, {
        title: "New leave request",
        body: message,
        href: "/leave",
      }),
      ...buildPushNotificationStatements(
        d1,
        recipientEmails,
        { title: "New leave request", body: message, href: "/leave" },
        `leave.requested:${commandKey}`,
      ),
    );
  }
  try {
    await d1.batch(statements);
  } catch (error) {
    if (idempotencyKey && String(error).includes("UNIQUE")) {
      const [existing] = await db
        .select({ request: leaveRequests, type: leaveTypes })
        .from(leaveRequests)
        .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
        .where(
          and(
            eq(leaveRequests.employeeId, user.employeeId),
            eq(leaveRequests.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existing)
        return {
          ...existing.request,
          typeName: existing.type.name,
          typeCode: existing.type.code,
          color: existing.type.color,
        };
    }
    throw error;
  }
  const [created] = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, user.employeeId),
        eq(leaveRequests.idempotencyKey, commandKey),
      ),
    )
    .limit(1);
  if (!created) throw new Error("Leave request was not persisted.");

  return {
    ...created,
    idempotencyKey,
    typeName: type.name,
    typeCode: type.code,
    color: type.color,
  };
}
