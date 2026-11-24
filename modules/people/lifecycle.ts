import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  employeeTerminations,
  employees,
  terminationReasonCatalog,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import type { TerminateEmployeeInput } from "@/modules/people/contracts";
import { ApplicationError } from "@/modules/shared/application-error";
import { getDateContext } from "@/modules/shared/date";
import { activeEmployeeCondition } from "@/modules/people/active";

export async function terminateEmployee(
  actor: CurrentUser,
  employeeId: number,
  input: TerminateEmployeeInput,
) {
  if (actor.role !== "super_admin") {
    throw new ApplicationError(
      "Only a super administrator can terminate employment.",
      403,
      "super_admin_required",
    );
  }
  const db = getDb();
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!employee)
    throw new ApplicationError(
      "Employee not found.",
      404,
      "employee_not_found",
    );
  const [existingTermination] = await db
    .select()
    .from(employeeTerminations)
    .where(eq(employeeTerminations.employeeId, employeeId))
    .limit(1);
  if (existingTermination) return existingTermination;
  if (employee.status === "inactive")
    throw new ApplicationError(
      "This employee is already inactive.",
      409,
      "employee_already_inactive",
    );
  if (input.lastWorkingDay > getDateContext().today)
    throw new ApplicationError(
      "The last working day cannot be in the future until scheduled offboarding is enabled.",
      400,
      "future_termination_not_supported",
    );
  const reasonRows = await db
    .select({ code: terminationReasonCatalog.code })
    .from(terminationReasonCatalog)
    .where(eq(terminationReasonCatalog.active, true));
  const allowed = new Set(reasonRows.map((row) => row.code));
  if (input.reasonCodes.some((code) => !allowed.has(code)))
    throw new ApplicationError(
      "One or more termination reasons are unavailable.",
      400,
      "invalid_termination_reason",
    );
  const transferId = input.taskTransferEmployeeId ?? employee.managerId ?? null;
  if (transferId === employeeId)
    throw new ApplicationError(
      "Tasks cannot be transferred to the same employee.",
      400,
      "invalid_task_transfer",
    );
  if (transferId) {
    const [target] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, transferId), activeEmployeeCondition()))
      .limit(1);
    if (!target)
      throw new ApplicationError(
        "The task transfer employee is not active.",
        400,
        "invalid_task_transfer",
      );
  }
  const d1 = getD1();
  const now = new Date().toISOString();
  const statements = [
    d1
      .prepare(
        "INSERT INTO employee_terminations (employee_id,last_working_day,termination_type,reason_codes_json,description,rehire_eligible,task_transfer_employee_id,terminated_by_email) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        employeeId,
        input.lastWorkingDay,
        input.terminationType,
        JSON.stringify(input.reasonCodes),
        input.description,
        input.rehireEligible ? 1 : 0,
        transferId,
        actor.email,
      ),
    d1
      .prepare(
        "UPDATE employees SET status='inactive' WHERE id=? AND status<>'inactive'",
      )
      .bind(employeeId),
    d1
      .prepare(
        "UPDATE users SET enabled=0,disabled_at=?,disabled_by_email=? WHERE employee_id=?",
      )
      .bind(now, actor.email, employeeId),
    d1
      .prepare(
        "UPDATE web_sessions SET revoked_at=? WHERE user_id=(SELECT id FROM users WHERE employee_id=?) AND revoked_at IS NULL",
      )
      .bind(now, employeeId),
    d1
      .prepare(
        "UPDATE client_sessions SET revoked_at=? WHERE (user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)) AND revoked_at IS NULL",
      )
      .bind(now, employeeId, employee.email),
    d1
      .prepare(
        "DELETE FROM oauth_authorization_codes WHERE user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)",
      )
      .bind(employeeId, employee.email),
    d1
      .prepare(
        "DELETE FROM mobile_push_tokens WHERE user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)",
      )
      .bind(employeeId, employee.email),
    d1
      .prepare(
        "UPDATE break_entries SET ended_at=? WHERE ended_at IS NULL AND time_entry_id IN (SELECT id FROM time_entries WHERE employee_id=? AND clock_out IS NULL)",
      )
      .bind(now, employeeId),
    d1
      .prepare(
        "UPDATE time_entries SET clock_out=? WHERE employee_id=? AND clock_out IS NULL AND clock_in < ?",
      )
      .bind(now, employeeId, now),
    d1
      .prepare(
        "UPDATE leave_requests SET status='withdrawn',reviewer_email=?,reviewer_note='Cancelled during offboarding',reviewed_at=? WHERE employee_id=? AND status='pending'",
      )
      .bind(actor.email, now, employeeId),
    d1
      .prepare(
        "UPDATE reimbursement_requests SET status='withdrawn',reviewer_email=?,reviewer_note='Cancelled during offboarding',reviewed_at=? WHERE employee_id=? AND status='pending'",
      )
      .bind(actor.email, now, employeeId),
    d1
      .prepare(
        "UPDATE time_corrections SET status='rejected',reviewer_email=?,reviewer_note='Cancelled during offboarding',reviewed_at=? WHERE employee_id=? AND status='pending'",
      )
      .bind(actor.email, now, employeeId),
    d1
      .prepare(
        "INSERT INTO employment_history (employee_id,effective_date,job_title,department,division,team,level,location,manager_id,employment_type,status,change_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        employeeId,
        input.lastWorkingDay,
        employee.jobTitle,
        employee.department,
        employee.division,
        employee.team,
        employee.level,
        employee.location,
        employee.managerId,
        employee.employmentType,
        "inactive",
        `Employment ended: ${input.terminationType}`,
      ),
    d1
      .prepare(
        "INSERT INTO audit_events (actor_email,action,entity_type,entity_id,details) VALUES (?,'employee.terminated','employee',?,?)",
      )
      .bind(
        actor.email,
        String(employeeId),
        `${employee.email} terminated on ${input.lastWorkingDay}`,
      ),
  ];
  if (transferId)
    statements.splice(
      2,
      0,
      d1
        .prepare(
          "UPDATE people_tasks SET assignee_employee_id=? WHERE assignee_employee_id=? AND status='todo'",
        )
        .bind(transferId, employeeId),
    );
  await d1.batch(statements);
  const [termination] = await db
    .select()
    .from(employeeTerminations)
    .where(eq(employeeTerminations.employeeId, employeeId))
    .limit(1);
  return termination;
}

export async function getTerminationReasonCatalog() {
  return getDb()
    .select({
      code: terminationReasonCatalog.code,
      label: terminationReasonCatalog.label,
    })
    .from(terminationReasonCatalog)
    .where(eq(terminationReasonCatalog.active, true))
    .orderBy(
      terminationReasonCatalog.sortOrder,
      terminationReasonCatalog.label,
    );
}
