import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { employees, leaveRequests, leaveTypes } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { reviewLeaveRequestSchema } from "@/modules/leave/contracts";
import { parseJsonRequest } from "@/modules/shared/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const { id } = await params;
  const requestId = Number(id);
  const parsed = await parseJsonRequest(request, reviewLeaveRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { action, note } = parsed.data;
  if (!Number.isInteger(requestId)) {
    return Response.json({ error: "Invalid leave action." }, { status: 400 });
  }

  const db = getDb();
  const [leave] = await db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      leaveTypeId: leaveRequests.leaveTypeId,
      days: leaveRequests.days,
      status: leaveRequests.status,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
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

  if (!leave) {
    return Response.json(
      { error: "Leave request not found." },
      { status: 404 },
    );
  }

  if (action === "withdrawn") {
    if (
      user.employeeId !== leave.employeeId ||
      !["pending", "approved"].includes(leave.status)
    ) {
      return Response.json(
        { error: "This request cannot be withdrawn." },
        { status: 403 },
      );
    }
  } else {
    if (user.employeeId === leave.employeeId) {
      return Response.json(
        { error: "You cannot review your own leave request." },
        { status: 403 },
      );
    }
    if (!access.approveLeave) {
      return Response.json(
        { error: "Manager access required." },
        { status: 403 },
      );
    }
    if (user.role === "manager" && leave.managerId !== user.employeeId) {
      return Response.json(
        { error: "Managers may review direct reports only." },
        { status: 403 },
      );
    }
    if (leave.status !== "pending") {
      return Response.json(
        { error: "Only pending requests can be reviewed." },
        { status: 409 },
      );
    }
  }

  const reviewedAt = new Date().toISOString();
  const reviewerEmail =
    action === "withdrawn" ? leave.employeeEmail : user.email;
  const d1 = getD1();
  const [reviewResult] = await d1.batch([
    d1
      .prepare(
        "UPDATE leave_requests SET status=?, reviewer_email=?, reviewer_note=?, reviewed_at=? WHERE id=? AND status=? RETURNING id",
      )
      .bind(action, reviewerEmail, note, reviewedAt, requestId, leave.status),
    d1
      .prepare(
        "INSERT INTO audit_events(actor_email, action, entity_type, entity_id, details) SELECT ?, ?, 'leave_request', ?, ? WHERE EXISTS (SELECT 1 FROM leave_requests WHERE id=? AND status=? AND reviewed_at=?)",
      )
      .bind(
        user.email,
        `leave.${action}`,
        String(requestId),
        `${leave.typeName}: ${leave.startDate}–${leave.endDate}`,
        requestId,
        action,
        reviewedAt,
      ),
    d1
      .prepare(
        "INSERT INTO notifications(user_email, title, message, href) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM leave_requests WHERE id=? AND status=? AND reviewed_at=?)",
      )
      .bind(
        leave.employeeEmail,
        `Leave request ${action}`,
        `${leave.typeName} for ${leave.startDate}–${leave.endDate} is ${action}.`,
        "/leave",
        requestId,
        action,
        reviewedAt,
      ),
  ]);
  const updatedId = Number(
    (reviewResult.results?.[0] as { id?: number } | undefined)?.id ?? 0,
  );
  if (!updatedId) {
    return Response.json(
      { error: "This request was already changed by another reviewer." },
      { status: 409 },
    );
  }
  const [updated] = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.id, requestId))
    .limit(1);
  return Response.json({ request: updated });
}
