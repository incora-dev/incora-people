import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { employees, reimbursementRequests } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { reviewReimbursementSchema } from "@/modules/reimbursements/contracts";
import { canReviewExpense } from "@/modules/reimbursements/access";
import { parseJsonRequest } from "@/modules/shared/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const { id } = await params;
  const requestId = Number(id);
  const parsed = await parseJsonRequest(request, reviewReimbursementSchema);
  if (!parsed.ok) return parsed.response;
  const { action, note } = parsed.data;
  if (!Number.isInteger(requestId)) {
    return Response.json(
      { error: "Invalid reimbursement action." },
      { status: 400 },
    );
  }
  const [expense] = await getDb()
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
  if (!expense)
    return Response.json({ error: "Request not found." }, { status: 404 });
  if (action === "withdrawn") {
    if (
      user.employeeId !== expense.employeeId ||
      expense.status !== "pending"
    ) {
      return Response.json(
        { error: "Only your pending request can be withdrawn." },
        { status: 403 },
      );
    }
  } else {
    if (!canReviewExpense(user, access, expense.managerId))
      return Response.json(
        { error: "Expense approver access required." },
        { status: 403 },
      );
    if (expense.status !== "pending")
      return Response.json(
        { error: "Only pending requests can be reviewed." },
        { status: 409 },
      );
  }
  let updated;
  const reviewedAt = new Date().toISOString();
  const reviewerEmail =
    action === "withdrawn" ? expense.employeeEmail : user.email;
  try {
    const d1 = getD1();
    const [reviewResult] = await d1.batch([
      d1
        .prepare(
          "UPDATE reimbursement_requests SET status=?, reviewer_email=?, reviewer_note=?, reviewed_at=? WHERE id=? AND status=? RETURNING id",
        )
        .bind(
          action,
          reviewerEmail,
          note,
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
          `reimbursement.${action}`,
          String(requestId),
          `${expense.category}: ${expense.amountCents / 100} ${expense.currency}`,
          requestId,
          action,
          reviewedAt,
        ),
      d1
        .prepare(
          "INSERT INTO notifications(user_email, title, message, href) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM reimbursement_requests WHERE id=? AND status=? AND reviewed_at=?)",
        )
        .bind(
          expense.employeeEmail,
          `Reimbursement ${action}`,
          `${expense.category} reimbursement is ${action}.`,
          "/expenses",
          requestId,
          action,
          reviewedAt,
        ),
    ]);
    const updatedId = Number(
      (reviewResult.results?.[0] as { id?: number } | undefined)?.id ?? 0,
    );
    if (!updatedId) updated = null;
    else {
      [updated] = await getDb()
        .select()
        .from(reimbursementRequests)
        .where(eq(reimbursementRequests.id, requestId))
        .limit(1);
    }
  } catch (error) {
    if (String(error).includes("reimbursement_policy_limit")) {
      return Response.json(
        { error: "This request exceeds the active reimbursement policy." },
        { status: 409 },
      );
    }
    throw error;
  }
  if (!updated) {
    return Response.json(
      { error: "This request was already changed by another reviewer." },
      { status: 409 },
    );
  }
  return Response.json({ request: updated });
}
