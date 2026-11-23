import { eq } from "drizzle-orm";
import {
  employees,
  leaveRequests,
  leaveTypes,
  reimbursementRequests,
} from "@/db/schema";
import { getD1, getDb } from "@/db";
import { getAccessPolicy, type CurrentUser } from "@/lib/auth";
import { sendMobilePush } from "@/modules/notifications/push";
import { canReviewExpense } from "@/modules/reimbursements/access";

type LeaveAction = "approved" | "rejected" | "withdrawn";
type ExpenseAction = "approved" | "rejected" | "withdrawn";

export class ApprovalError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function reviewLeaveForClient(
  user: CurrentUser,
  requestId: number,
  input: { action: LeaveAction; note: string },
) {
  const db = getDb();
  const access = await getAccessPolicy(user);
  const [leave] = await db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      leaveTypeId: leaveRequests.leaveTypeId,
      days: leaveRequests.days,
      status: leaveRequests.status,
      startDate: leaveRequests.startDate,
      employeeEmail: employees.email,
      managerId: employees.managerId,
      typeName: leaveTypes.name,
      typeCode: leaveTypes.code,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(eq(leaveRequests.id, requestId))
    .limit(1);
  if (!leave) throw new ApprovalError("Leave request not found.", 404);
  if (input.action === "withdrawn") {
    if (
      user.employeeId !== leave.employeeId ||
      !["pending", "approved"].includes(leave.status)
    )
      throw new ApprovalError("This request cannot be withdrawn.", 403);
  } else {
    if (user.employeeId === leave.employeeId)
      throw new ApprovalError("You cannot review your own leave request.", 403);
    if (!access.approveLeave)
      throw new ApprovalError("Manager access required.", 403);
    if (user.role === "manager" && leave.managerId !== user.employeeId)
      throw new ApprovalError("Managers may review direct reports only.", 403);
    if (leave.status !== "pending")
      throw new ApprovalError("Only pending requests can be reviewed.", 409);
  }
  const reviewedAt = new Date().toISOString();
  const reviewerEmail =
    input.action === "withdrawn" ? leave.employeeEmail : user.email;
  const d1 = getD1();
  const [reviewResult] = await d1.batch([
    d1
      .prepare(
        "UPDATE leave_requests SET status=?, reviewer_email=?, reviewer_note=?, reviewed_at=? WHERE id=? AND status=? RETURNING id",
      )
      .bind(
        input.action,
        reviewerEmail,
        input.note,
        reviewedAt,
        requestId,
        leave.status,
      ),
    d1
      .prepare(
        "INSERT INTO audit_events(actor_email, action, entity_type, entity_id, details) SELECT ?, ?, 'leave_request', ?, ? WHERE EXISTS (SELECT 1 FROM leave_requests WHERE id=? AND status=? AND reviewed_at=?)",
      )
      .bind(
        user.email,
        `leave.${input.action}`,
        String(requestId),
        `${leave.typeName}: ${leave.startDate}`,
        requestId,
        input.action,
        reviewedAt,
      ),
    d1
      .prepare(
        "INSERT INTO notifications(user_email, title, message, href) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM leave_requests WHERE id=? AND status=? AND reviewed_at=?)",
      )
      .bind(
        leave.employeeEmail,
        `Leave request ${input.action}`,
        `${leave.typeName} for ${leave.startDate} is ${input.action}.`,
        "/leave",
        requestId,
        input.action,
        reviewedAt,
      ),
  ]);
  const updatedId = Number(
    (reviewResult.results?.[0] as { id?: number } | undefined)?.id ?? 0,
  );
  if (!updatedId)
    throw new ApprovalError(
      "This request was already changed by another reviewer.",
      409,
    );
  const [updated] = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.id, requestId))
    .limit(1);
  await sendMobilePush(
    [leave.employeeEmail],
    {
      title: `Leave request ${input.action}`,
      body: `${leave.typeName} for ${leave.startDate} is ${input.action}.`,
      href: "/leave",
    },
    `leave.${input.action}:${requestId}`,
  ).catch(() => undefined);
  return updated;
}

export async function reviewExpenseForClient(
  user: CurrentUser,
  requestId: number,
  input: { action: ExpenseAction; note: string },
) {
  const db = getDb();
  const access = await getAccessPolicy(user);
  const [expense] = await db
    .select({
      id: reimbursementRequests.id,
      employeeId: reimbursementRequests.employeeId,
      status: reimbursementRequests.status,
      managerId: employees.managerId,
      employeeEmail: employees.email,
      category: reimbursementRequests.category,
      amountCents: reimbursementRequests.amountCents,
      currency: reimbursementRequests.currency,
    })
    .from(reimbursementRequests)
    .innerJoin(employees, eq(reimbursementRequests.employeeId, employees.id))
    .where(eq(reimbursementRequests.id, requestId))
    .limit(1);
  if (!expense) throw new ApprovalError("Request not found.", 404);
  if (input.action === "withdrawn") {
    if (user.employeeId !== expense.employeeId || expense.status !== "pending")
      throw new ApprovalError(
        "Only your pending request can be withdrawn.",
        403,
      );
  } else {
    if (!canReviewExpense(user, access, expense.managerId))
      throw new ApprovalError("Expense approver access required.", 403);
    if (expense.status !== "pending")
      throw new ApprovalError("Only pending requests can be reviewed.", 409);
  }
  let updated;
  try {
    const reviewedAt = new Date().toISOString();
    const reviewerEmail =
      input.action === "withdrawn" ? expense.employeeEmail : user.email;
    const d1 = getD1();
    const [reviewResult] = await d1.batch([
      d1
        .prepare(
          "UPDATE reimbursement_requests SET status=?, reviewer_email=?, reviewer_note=?, reviewed_at=? WHERE id=? AND status=? RETURNING id",
        )
        .bind(
          input.action,
          reviewerEmail,
          input.note,
          reviewedAt,
          requestId,
          expense.status,
        ),
      d1
        .prepare(
          "INSERT INTO audit_events(actor_email, action, entity_type, entity_id, details) SELECT ?, ?, 'reimbursement_request', ?, ? WHERE EXISTS (SELECT 1 FROM reimbursement_requests WHERE id=? AND status=? AND reviewed_at=?)",
        )
        .bind(
          user.email,
          `reimbursement.${input.action}`,
          String(requestId),
          `${expense.category}: ${expense.amountCents / 100} ${expense.currency}`,
          requestId,
          input.action,
          reviewedAt,
        ),
      d1
        .prepare(
          "INSERT INTO notifications(user_email, title, message, href) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM reimbursement_requests WHERE id=? AND status=? AND reviewed_at=?)",
        )
        .bind(
          expense.employeeEmail,
          `Reimbursement ${input.action}`,
          `${expense.category} reimbursement is ${input.action}.`,
          "/expenses",
          requestId,
          input.action,
          reviewedAt,
        ),
    ]);
    const updatedId = Number(
      (reviewResult.results?.[0] as { id?: number } | undefined)?.id ?? 0,
    );
    if (!updatedId) updated = null;
    else {
      [updated] = await db
        .select()
        .from(reimbursementRequests)
        .where(eq(reimbursementRequests.id, requestId))
        .limit(1);
    }
  } catch (error) {
    if (String(error).includes("reimbursement_policy_limit")) {
      throw new ApprovalError(
        "This request exceeds the active reimbursement policy.",
        409,
      );
    }
    throw error;
  }
  if (!updated)
    throw new ApprovalError(
      "This request was already changed by another reviewer.",
      409,
    );
  await sendMobilePush(
    [expense.employeeEmail],
    {
      title: `Reimbursement ${input.action}`,
      body: `${expense.category} reimbursement is ${input.action}.`,
      href: "/expenses",
    },
    `reimbursement.${input.action}:${requestId}`,
  ).catch(() => undefined);
  return updated;
}
