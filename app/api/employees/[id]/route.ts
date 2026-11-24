import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  employeePrivateDetails,
  employmentHistory,
  employees,
  referenceValues,
  users,
} from "@/db/schema";
import {
  getAccessPolicy,
  getCurrentUser,
  hasRecentAuthentication,
  isProtectedSuperAdminUserId,
  recentAuthenticationResponse,
} from "@/lib/auth";
import { getProtectedSuperAdminEmails } from "@/modules/settings/system";
import {
  employmentChangeEmployeeSchema,
  employmentCorrectionEmployeeSchema,
  updateEmployeeSchema,
} from "@/modules/people/contracts";
import { parseJsonRequest } from "@/modules/shared/http";
import {
  assertTechnologyReferences,
  resolveEmployeeReferences,
} from "@/modules/people/reference-data";
import { getDateContext } from "@/modules/shared/date";
import {
  employmentChangeConflict,
  genericProfileStartDateChanged,
  hasEmploymentStateChanged,
  latestEmploymentStateChangeDate,
} from "@/modules/people/employment-profile";
import { sensitiveEmployeeMutationResponse } from "@/modules/people/privacy";
import {
  classifyEmployeeDeletionReference,
  deleteErroneousEmployeeSchema,
  employeeDeletionBlocker,
  employeeDeletionError,
  employeeDeletionReferenceCategory,
  type EmployeeDeletionForeignKey,
} from "@/modules/people/deletion-policy";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.managePeople) {
    return Response.json(
      { error: "HR administrator access required." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId)) {
    return Response.json({ error: "Invalid employee id." }, { status: 400 });
  }

  const payload = await request
    .clone()
    .json()
    .catch(() => null);
  const employmentMode =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? "employmentChange" in payload && payload.employmentChange === true
        ? "change"
        : "employmentEdit" in payload && payload.employmentEdit === true
          ? "correction"
          : "profile"
      : "profile";
  const sensitiveAccessDenied = sensitiveEmployeeMutationResponse(
    payload,
    access.viewSensitiveData,
  );
  if (sensitiveAccessDenied) return sensitiveAccessDenied;
  if (employmentMode === "change") {
    const parsedChange = await parseJsonRequest(
      request,
      employmentChangeEmployeeSchema,
    );
    if (!parsedChange.ok) return parsedChange.response;
    return updateEmploymentFields(Number(id), parsedChange.data, user.email);
  }
  if (employmentMode === "correction") {
    const parsedCorrection = await parseJsonRequest(
      request,
      employmentCorrectionEmployeeSchema,
    );
    if (!parsedCorrection.ok) return parsedCorrection.response;
    return updateEmploymentFields(
      Number(id),
      parsedCorrection.data,
      user.email,
    );
  }

  const parsed = await parseJsonRequest(request, updateEmployeeSchema);
  if (!parsed.ok) return parsed.response;
  const privateFields = [
    parsed.data.taxCode,
    parsed.data.contractEndDate,
    parsed.data.passportNumber,
    parsed.data.passportDate,
    parsed.data.passportAuthority,
    parsed.data.legalEntityValueId,
  ];
  const updatePrivateDetails = privateFields.some(
    (value) => value !== undefined,
  );
  const {
    firstName,
    lastName,
    email,
    jobTitle,
    department,
    employmentType,
    status,
    startDate,
    managerId,
    employeeCode,
    ukrainianName,
    personalEmail,
    phone,
    birthDate,
    gender,
    address,
    division,
    team,
    level,
    probationEnd,
    changeReason,
    technologies,
    effectiveDate,
    employmentChange,
  } = parsed.data;
  if (managerId === employeeId) {
    return Response.json(
      { error: "A person cannot manage themselves." },
      { status: 400 },
    );
  }

  const db = getDb();
  const [current] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!current)
    return Response.json({ error: "Employee not found." }, { status: 404 });
  if (genericProfileStartDateChanged(current.startDate, startDate)) {
    return Response.json(
      {
        error:
          "Start date cannot be changed in the generic profile editor. Use a dedicated lifecycle correction flow.",
      },
      { status: 409 },
    );
  }
  const normalizedEmail = email.trim().toLowerCase();
  const [duplicateEmployee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        sql`lower(trim(${employees.email})) = ${normalizedEmail}`,
        ne(employees.id, employeeId),
      ),
    )
    .limit(1);
  const [duplicateAccount] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        sql`lower(trim(${users.email})) = ${normalizedEmail}`,
        or(isNull(users.employeeId), ne(users.employeeId, employeeId)),
      ),
    )
    .limit(1);
  if (duplicateEmployee || duplicateAccount) {
    return Response.json(
      { error: "This email is already in use." },
      { status: 409 },
    );
  }
  const { today } = getDateContext();
  const location = parsed.data.location ?? current.location;
  const stateEffectiveDate = effectiveDate || today;
  const [existingPrivateDetails] = updatePrivateDetails
    ? await db
        .select()
        .from(employeePrivateDetails)
        .where(eq(employeePrivateDetails.employeeId, employeeId))
        .limit(1)
    : [];
  const legalEntityValueId =
    parsed.data.legalEntityValueId === undefined
      ? (existingPrivateDetails?.legalEntityValueId ?? null)
      : parsed.data.legalEntityValueId;
  if (updatePrivateDetails && legalEntityValueId !== null) {
    const [legalEntity] = await db
      .select({ id: referenceValues.id })
      .from(referenceValues)
      .where(
        and(
          eq(referenceValues.id, legalEntityValueId),
          eq(referenceValues.kind, "legal_entity"),
          eq(referenceValues.active, true),
        ),
      )
      .limit(1);
    if (!legalEntity)
      return Response.json(
        { error: "Select a legal entity from the managed profile dictionary." },
        { status: 400 },
      );
  }
  if (status === "inactive" && current.status !== "inactive") {
    return Response.json(
      { error: "Use the termination workflow to deactivate an employee." },
      { status: 409 },
    );
  }
  if (current.status === "inactive" && status !== "inactive") {
    return Response.json(
      {
        error:
          "Inactive employees cannot be reactivated through generic profile updates.",
      },
      { status: 409 },
    );
  }
  let references;
  let allowedTechnologies;
  try {
    [references, allowedTechnologies] = await Promise.all([
      resolveEmployeeReferences({
        division,
        department,
        team,
        divisionUnitId: parsed.data.divisionUnitId,
        departmentUnitId: parsed.data.departmentUnitId,
        teamUnitId: parsed.data.teamUnitId,
        jobTitle,
        level,
        employmentType: employmentType || current.employmentType,
      }),
      assertTechnologyReferences(technologies),
    ]);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid profile data.",
      },
      { status: 400 },
    );
  }
  if (employmentChange) {
    if (!changeReason.trim()) {
      return Response.json(
        { error: "Add a reason for the employment change." },
        { status: 400 },
      );
    }
    if (
      !effectiveDate ||
      effectiveDate < current.startDate ||
      effectiveDate > today
    ) {
      return Response.json(
        { error: "Choose an effective date between the start date and today." },
        { status: 400 },
      );
    }
    const changed =
      current.jobTitle !== references.canonical.jobTitle ||
      current.department !== references.canonical.department ||
      current.division !== references.canonical.division ||
      current.team !== references.canonical.team ||
      current.level !== references.canonical.level ||
      current.location !== location ||
      current.managerId !== managerId ||
      current.employmentType !== references.canonical.employmentType ||
      current.status !== status;
    if (!changed) {
      return Response.json(
        { error: "Change at least one employment field before saving." },
        { status: 409 },
      );
    }
  }
  const [manager] = managerId
    ? await db
        .select()
        .from(employees)
        .where(eq(employees.id, managerId))
        .limit(1)
    : [];
  const employmentStateChanged = hasEmploymentStateChanged(current, {
    jobTitle: references.canonical.jobTitle,
    department: references.canonical.department,
    division: references.canonical.division,
    team: references.canonical.team,
    level: references.canonical.level,
    location,
    managerId,
    employmentType: references.canonical.employmentType,
    status,
  });

  try {
    const d1 = getD1();
    const now = new Date().toISOString();
    const emailChanged =
      current.email.trim().toLowerCase() !== email.trim().toLowerCase();
    const statements = [
      d1
        .prepare(
          "UPDATE employees SET first_name=?,last_name=?,email=?,job_title=?,department=?,employment_type=?,status=?,start_date=?,manager_id=?,manager_name=?,employee_code=?,ukrainian_name=?,personal_email=?,phone=?,birth_date=?,gender=?,address=?,division=?,team=?,level=?,location=?,probation_end=?,division_unit_id=?,department_unit_id=?,team_unit_id=?,position_value_id=?,level_value_id=?,employment_type_id=? WHERE id=?",
        )
        .bind(
          firstName,
          lastName,
          email,
          references.canonical.jobTitle,
          references.canonical.department,
          references.canonical.employmentType,
          status,
          current.startDate,
          managerId,
          manager ? `${manager.firstName} ${manager.lastName}` : null,
          employeeCode || null,
          ukrainianName || null,
          personalEmail === undefined
            ? current.personalEmail
            : personalEmail || null,
          phone === undefined ? current.phone : phone || null,
          birthDate === undefined ? current.birthDate : birthDate || null,
          gender === undefined ? current.gender : gender || null,
          address === undefined ? current.address : address || null,
          references.canonical.division,
          references.canonical.team,
          references.canonical.level,
          location,
          probationEnd || null,
          references.division.id,
          references.department.id,
          references.team?.id ?? null,
          references.position.id,
          references.level?.id ?? null,
          references.employmentType.id,
          employeeId,
        ),
      d1
        .prepare("UPDATE users SET email=? WHERE employee_id=?")
        .bind(email, employeeId),
      d1
        .prepare(
          "DELETE FROM employee_profile_records WHERE employee_id=? AND kind='skill'",
        )
        .bind(employeeId),
      ...allowedTechnologies.map(({ id, label }) =>
        d1
          .prepare(
            "INSERT INTO employee_profile_records (employee_id,kind,title,reference_value_id) VALUES (?,'skill',?,?)",
          )
          .bind(employeeId, label, id),
      ),
      d1
        .prepare(
          "INSERT INTO audit_events (actor_email,action,entity_type,entity_id,details) VALUES (?,'employee.updated','employee',?,?)",
        )
        .bind(
          user.email,
          String(employeeId),
          `Updated ${firstName} ${lastName}`,
        ),
    ];
    if (employmentStateChanged) {
      statements.push(
        d1
          .prepare(
            "INSERT INTO employment_history (employee_id,effective_date,job_title,department,division,team,level,location,manager_id,employment_type,status,change_reason) SELECT id,?,?,?,?,?,?,?,?,?,?,? FROM employees WHERE id=?",
          )
          .bind(
            stateEffectiveDate,
            references.canonical.jobTitle,
            references.canonical.department,
            references.canonical.division,
            references.canonical.team,
            references.canonical.level,
            location,
            managerId,
            references.canonical.employmentType,
            status,
            changeReason || "Employment details changed",
            employeeId,
          ),
      );
    }
    if (updatePrivateDetails) {
      statements.push(
        d1
          .prepare(
            "INSERT INTO employee_private_details (employee_id,tax_code,contract_end_date,passport_number,passport_date,passport_authority,legal_entity_value_id,updated_by_email,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET tax_code=excluded.tax_code,contract_end_date=excluded.contract_end_date,passport_number=excluded.passport_number,passport_date=excluded.passport_date,passport_authority=excluded.passport_authority,legal_entity_value_id=excluded.legal_entity_value_id,updated_by_email=excluded.updated_by_email,updated_at=excluded.updated_at",
          )
          .bind(
            employeeId,
            parsed.data.taxCode === undefined
              ? (existingPrivateDetails?.taxCode ?? null)
              : parsed.data.taxCode || null,
            parsed.data.contractEndDate === undefined
              ? (existingPrivateDetails?.contractEndDate ?? null)
              : parsed.data.contractEndDate || null,
            parsed.data.passportNumber === undefined
              ? (existingPrivateDetails?.passportNumber ?? null)
              : parsed.data.passportNumber || null,
            parsed.data.passportDate === undefined
              ? (existingPrivateDetails?.passportDate ?? null)
              : parsed.data.passportDate || null,
            parsed.data.passportAuthority === undefined
              ? (existingPrivateDetails?.passportAuthority ?? null)
              : parsed.data.passportAuthority || null,
            legalEntityValueId,
            user.email,
            now,
          ),
        d1
          .prepare(
            "INSERT INTO audit_events (actor_email,action,entity_type,entity_id,details) VALUES (?,'employee.private_details_updated','employee',?,'Sensitive employment details updated')",
          )
          .bind(user.email, String(employeeId)),
      );
    }
    if (emailChanged) {
      statements.push(
        // Migrate mutable email-owned records in the same D1 transaction.
        // Historical actor/audit fields intentionally remain immutable.
        d1
          .prepare(
            "UPDATE notifications SET user_email=? WHERE user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)",
          )
          .bind(email, employeeId, current.email),
        d1
          .prepare(
            "UPDATE notification_outbox SET user_email=? WHERE user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)",
          )
          .bind(email, employeeId, current.email),
        d1
          .prepare(
            "UPDATE mobile_push_tokens SET user_email=? WHERE user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)",
          )
          .bind(email, employeeId, current.email),
        d1
          .prepare(
            "UPDATE game_scores SET user_email=? WHERE lower(user_email)=lower(?)",
          )
          .bind(email, current.email),
        d1
          .prepare(
            "UPDATE bug_reports SET reporter_email=? WHERE reporter_user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(reporter_email)=lower(?)",
          )
          .bind(email, employeeId, current.email),
        d1
          .prepare(
            "UPDATE announcement_dismissals SET user_email=? WHERE user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)",
          )
          .bind(email, employeeId, current.email),
        d1
          .prepare(
            "UPDATE announcement_comments SET user_email=? WHERE user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)",
          )
          .bind(email, employeeId, current.email),
        d1
          .prepare(
            "UPDATE announcement_reactions SET user_email=? WHERE user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)",
          )
          .bind(email, employeeId, current.email),
        d1
          .prepare(
            "UPDATE announcement_poll_responses SET user_email=? WHERE user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)",
          )
          .bind(email, employeeId, current.email),
        d1
          .prepare(
            "UPDATE one_on_one_plans SET facilitator_email=? WHERE lower(facilitator_email)=lower(?)",
          )
          .bind(email, current.email),
        d1
          .prepare(
            "UPDATE one_on_one_meetings SET facilitator_email=? WHERE lower(facilitator_email)=lower(?)",
          )
          .bind(email, current.email),
        d1
          .prepare(
            "UPDATE web_sessions SET revoked_at=? WHERE user_id=(SELECT id FROM users WHERE employee_id=?) AND revoked_at IS NULL",
          )
          .bind(now, employeeId),
        d1
          .prepare(
            "UPDATE client_sessions SET revoked_at=? WHERE (user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)) AND revoked_at IS NULL",
          )
          .bind(now, employeeId, current.email),
        d1
          .prepare(
            "DELETE FROM oauth_authorization_codes WHERE user_id=(SELECT id FROM users WHERE employee_id=?) OR lower(user_email)=lower(?)",
          )
          .bind(employeeId, current.email),
      );
    }
    await d1.batch(statements);
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    return Response.json({ employee });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) {
      return Response.json(
        { error: "This email is already in use." },
        { status: 409 },
      );
    }
    if (message.includes("protected super administrator email cannot change")) {
      return Response.json(
        { error: "A protected super administrator email cannot be changed." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "Could not update the employee." },
      { status: 500 },
    );
  }
}

type DeletionEmployeeRow = {
  id: number;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  createdAt: string;
};

type DeletionAccountRow = {
  id: number;
  email: string;
  role: string;
};

type ForeignKeyRow = {
  table: string;
  from: string;
};

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function employeeDeletionReferences(
  d1: D1Database,
  employeeId: number,
  userId: number,
  email: string,
) {
  // D1 exposes internal tables in sqlite_master but rejects PRAGMAs on them.
  // All application tables still participate in the fail-closed FK scan.
  const tables = await d1
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND lower(substr(name,1,7))<>'sqlite_' AND lower(substr(name,1,4))<>'_cf_' ORDER BY name",
    )
    .all<{ name: string }>();
  const blockers = new Map<string, EmployeeDeletionForeignKey>();
  const blockerCategories = new Set<string>();
  let blockedReferenceCount = 0;

  const applicationTables = tables.results;
  if (!applicationTables.length) throw new Error("Missing application schema");
  // Batch the read-only lookups rather than issuing a D1 request per table.
  const foreignKeys = await d1.batch<ForeignKeyRow>(
    applicationTables.map(({ name }) =>
      d1.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(name)})`),
    ),
  );
  for (const [index, { name }] of applicationTables.entries()) {
    for (const reference of foreignKeys[index].results) {
      if (reference.table !== "employees" && reference.table !== "users") {
        continue;
      }
      const typedReference = {
        parent: reference.table,
        table: name,
        column: reference.from,
      };
      const disposition = classifyEmployeeDeletionReference(typedReference);
      if (
        disposition !== "blocked" &&
        disposition !== "routine-profile-metadata-cleanup"
      ) {
        continue;
      }
      const key = `${reference.table}.${name}.${reference.from}`;
      blockers.set(key, typedReference);
    }
  }

  const blockedReferences = [...blockers.values()];
  if (blockedReferences.length) {
    const referenceCounts = await d1.batch<{ count: number }>(
      blockedReferences.map((reference) => {
        const targetId = reference.parent === "employees" ? employeeId : userId;
        const filter =
          classifyEmployeeDeletionReference(reference) ===
          "routine-profile-metadata-cleanup"
            ? " AND kind<>'skill'"
            : "";
        return d1
          .prepare(
            `SELECT COUNT(*) AS count FROM ${quoteIdentifier(reference.table)} WHERE ${quoteIdentifier(reference.column)}=?${filter}`,
          )
          .bind(targetId);
      }),
    );
    for (const [index, reference] of blockedReferences.entries()) {
      const count = referenceCounts[index].results[0]?.count;
      if (count === undefined) throw new Error("Missing dependency count");
      blockedReferenceCount += count;
      if (count > 0)
        blockerCategories.add(employeeDeletionReferenceCategory(reference));
    }
  }

  const pendingDelivery = await d1
    .prepare(
      "SELECT COUNT(*) AS count FROM notification_outbox WHERE lower(user_email)=lower(?)",
    )
    .bind(email)
    .first<{ count: number }>();
  const pendingDeliveryCount = Number(pendingDelivery?.count ?? 0);
  blockedReferenceCount += pendingDeliveryCount;
  if (pendingDeliveryCount > 0) {
    blockerCategories.add("Pending notification records");
  }

  // A sent or failed invitation is a retained audit row, but a delivery that is
  // still in flight would race the deletion, so it blocks until it settles.
  const openInvitation = await d1
    .prepare(
      "SELECT COUNT(*) AS count FROM employee_invitation_attempts WHERE employee_id=? AND status IN ('sending','uncertain')",
    )
    .bind(employeeId)
    .first<{ count: number }>();
  const openInvitationCount = Number(openInvitation?.count ?? 0);
  blockedReferenceCount += openInvitationCount;
  if (openInvitationCount > 0) {
    blockerCategories.add("Invitation delivery in progress");
  }

  return {
    blockedReferenceCount,
    blockedReferences,
    blockerCategories: [...blockerCategories],
  };
}

// Keep the generated SQL shallow as new foreign-key relationships are added.
function balancedDeletionChecks(checks: string[]): string {
  if (checks.length <= 1) return checks[0] ?? "1";
  const middle = Math.floor(checks.length / 2);
  return `(${balancedDeletionChecks(checks.slice(0, middle))} AND ${balancedDeletionChecks(checks.slice(middle))})`;
}

function buildDeletionGuard(
  employeeId: number,
  userId: number,
  actorUserId: number,
  employee: DeletionEmployeeRow,
  blockedReferences: EmployeeDeletionForeignKey[],
) {
  const referenceChecks = blockedReferences.map((reference) => {
    if (
      reference.parent === "employees" &&
      reference.table === "employee_profile_records" &&
      reference.column === "employee_id"
    ) {
      return "NOT EXISTS (SELECT 1 FROM employee_profile_records linked WHERE linked.employee_id=? AND linked.kind<>'skill')";
    }
    return `NOT EXISTS (SELECT 1 FROM ${quoteIdentifier(reference.table)} linked WHERE linked.${quoteIdentifier(reference.column)} = ?)`;
  });
  const referenceValues = blockedReferences.map((reference) =>
    reference.parent === "employees" ? employeeId : userId,
  );
  return {
    sql: `EXISTS (
      SELECT 1 FROM employees e
      JOIN users u ON u.employee_id=e.id
      WHERE e.id=? AND u.id=? AND u.id<>?
        AND (SELECT COUNT(*) FROM users linked_account WHERE linked_account.employee_id=e.id)=1
        AND e.email=? AND e.employee_code IS ? AND e.first_name=? AND e.last_name=?
        AND u.role='employee'
        AND lower(trim(e.email))=lower(trim(u.email))
        AND NOT EXISTS (SELECT 1 FROM protected_admin_accounts p WHERE p.user_id=u.id)
        AND NOT EXISTS (
          SELECT 1 FROM system_settings setting, json_each(setting.value_json) protected_email
          WHERE setting.key='protected_super_admin_emails'
            AND lower(trim(CAST(protected_email.value AS TEXT)))=lower(trim(u.email))
        )
        AND EXISTS (
          SELECT 1 FROM users actor_account
          WHERE actor_account.id=? AND actor_account.role='super_admin' AND actor_account.enabled=1
        )
        AND (SELECT COUNT(*) FROM employment_history h WHERE h.employee_id=e.id)=1
        AND EXISTS (
          SELECT 1 FROM employment_history h
          WHERE h.employee_id=e.id AND h.effective_date=e.start_date
            AND h.job_title=e.job_title AND h.department=e.department
            AND h.division=e.division AND h.team IS e.team
            AND h.level IS e.level AND h.location=e.location
            AND h.manager_id IS e.manager_id
            AND h.employment_type=e.employment_type AND h.status=e.status
            AND h.change_reason='Employee created'
        )
        AND NOT EXISTS (
          SELECT 1 FROM leave_balances balance
          WHERE balance.employee_id=e.id
            AND (balance.used<>0 OR balance.adjustment<>0)
        )
        AND NOT EXISTS (
          SELECT 1 FROM notification_outbox outbox
          WHERE lower(outbox.user_email)=lower(e.email)
        )
        AND NOT EXISTS (
          SELECT 1 FROM employee_invitation_attempts invitation
          WHERE invitation.employee_id=e.id
            AND invitation.status IN ('sending','uncertain')
        )
        AND ${balancedDeletionChecks(referenceChecks)}
    )`,
    values: [
      employeeId,
      userId,
      actorUserId,
      employee.email,
      employee.employeeCode,
      employee.firstName,
      employee.lastName,
      actorUserId,
      ...referenceValues,
    ],
  };
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  if (
    actor.isPreview ||
    actor.role !== "super_admin" ||
    actor.userId === null
  ) {
    return Response.json(
      { error: "Only a Super Admin can permanently remove an employee." },
      { status: 403 },
    );
  }
  const employeeId = Number((await params).id);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
    return Response.json({ error: "Invalid employee id." }, { status: 400 });
  }
  if (!hasRecentAuthentication(actor)) {
    return recentAuthenticationResponse(`/employees/${employeeId}`);
  }
  const parsed = await parseJsonRequest(request, deleteErroneousEmployeeSchema);
  if (!parsed.ok) return parsed.response;

  const d1 = getD1();
  const replay = await d1
    .prepare(
      "SELECT 1 AS found FROM audit_events WHERE action='employee.permanently_deleted' AND entity_type='employee_deletion' AND entity_id=? AND actor_email=? LIMIT 1",
    )
    .bind(parsed.data.requestId, actor.email)
    .first<{ found: number }>();
  if (replay) return Response.json({ ok: true, replayed: true });

  const employee = await d1
    .prepare(
      "SELECT id,employee_code AS employeeCode,first_name AS firstName,last_name AS lastName,email,status,created_at AS createdAt FROM employees WHERE id=? LIMIT 1",
    )
    .bind(employeeId)
    .first<DeletionEmployeeRow>();
  if (!employee) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }
  const linkedAccounts = await d1
    .prepare("SELECT id,email,role FROM users WHERE employee_id=?")
    .bind(employeeId)
    .all<DeletionAccountRow>();
  const account =
    linkedAccounts.results?.length === 1 ? linkedAccounts.results[0] : null;
  if (!account) {
    return Response.json(
      {
        error: "The employee and account relationship is missing or ambiguous.",
      },
      { status: 409 },
    );
  }

  const configuredProtectedEmails = await getProtectedSuperAdminEmails();
  const protectedTarget =
    (await isProtectedSuperAdminUserId(account.id)) ||
    configuredProtectedEmails.includes(employee.email.trim().toLowerCase()) ||
    configuredProtectedEmails.includes(account.email.trim().toLowerCase());
  let references: Awaited<ReturnType<typeof employeeDeletionReferences>>;
  try {
    references = await employeeDeletionReferences(
      d1,
      employeeId,
      account.id,
      employee.email,
    );
  } catch {
    return Response.json(
      { error: "Could not verify employee dependencies. No data was changed." },
      { status: 500 },
    );
  }
  const history = await d1
    .prepare(
      `SELECT COUNT(*) AS total,COUNT(CASE WHEN h.effective_date=e.start_date
        AND h.job_title=e.job_title AND h.department=e.department
        AND h.division=e.division AND h.team IS e.team AND h.level IS e.level
        AND h.location=e.location AND h.manager_id IS e.manager_id
        AND h.employment_type=e.employment_type AND h.status=e.status
        AND h.change_reason='Employee created' THEN 1 END) AS pristine
       FROM employment_history h JOIN employees e ON e.id=h.employee_id
       WHERE e.id=?`,
    )
    .bind(employeeId)
    .first<{ total: number; pristine: number }>();
  const balances = await d1
    .prepare(
      `SELECT COUNT(*) AS total,COUNT(CASE WHEN used=0 AND adjustment=0 THEN 1 END) AS unused
       FROM leave_balances WHERE employee_id=?`,
    )
    .bind(employeeId)
    .first<{ total: number; unused: number }>();

  const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
  const blocker = employeeDeletionBlocker({
    actorUserId: actor.userId,
    targetUserId: account.id,
    targetRole: account.role,
    accountMatchesEmployee:
      account.email.trim().toLowerCase() ===
      employee.email.trim().toLowerCase(),
    protectedIdentity: protectedTarget,
    pristineInitialHistory:
      Number(history?.total ?? 0) === 1 && Number(history?.pristine ?? 0) === 1,
    onlyUnusedGeneratedLeaveBalances:
      Number(balances?.total ?? 0) === Number(balances?.unused ?? 0),
    blockedReferenceCount: references.blockedReferenceCount,
    confirmationName: parsed.data.confirmationName,
    employeeName,
    confirmsErroneousTestRecord:
      parsed.data.confirmsErroneousTestRecord === true,
  });
  if (blocker) {
    return Response.json(
      {
        error: employeeDeletionError(blocker),
        ...(blocker === "linked_records"
          ? { blockerCategories: references.blockerCategories }
          : {}),
      },
      { status: blocker === "confirmation" ? 400 : 409 },
    );
  }

  const guard = buildDeletionGuard(
    employeeId,
    account.id,
    actor.userId,
    employee,
    references.blockedReferences,
  );
  const now = new Date().toISOString();
  const guardedDelete = (sqlText: string, leadingValues: unknown[]) =>
    d1.prepare(sqlText).bind(...leadingValues, ...guard.values);
  try {
    const results = await d1.batch([
      guardedDelete(
        `DELETE FROM employee_view_previews
         WHERE (target_employee_id=? OR target_user_id=?) AND (${guard.sql})`,
        [employeeId, account.id],
      ),
      guardedDelete(
        `DELETE FROM web_sessions WHERE user_id=? AND (${guard.sql})`,
        [account.id],
      ),
      guardedDelete(
        `DELETE FROM client_sessions WHERE (user_id=? OR lower(user_email)=lower(?)) AND (${guard.sql})`,
        [account.id, employee.email],
      ),
      guardedDelete(
        `DELETE FROM oauth_authorization_codes WHERE (user_id=? OR lower(user_email)=lower(?)) AND (${guard.sql})`,
        [account.id, employee.email],
      ),
      guardedDelete(
        `DELETE FROM mobile_push_tokens WHERE (user_id=? OR lower(user_email)=lower(?)) AND (${guard.sql})`,
        [account.id, employee.email],
      ),
      guardedDelete(
        `DELETE FROM notifications WHERE (user_id=? OR lower(user_email)=lower(?)) AND (${guard.sql})`,
        [account.id, employee.email],
      ),
      guardedDelete(
        `DELETE FROM users WHERE id=? AND employee_id=? AND (${guard.sql})`,
        [account.id, employeeId],
      ),
      d1
        .prepare(
          `INSERT INTO audit_events(actor_email,action,entity_type,entity_id,details,created_at)
           SELECT ?, 'employee.permanently_deleted', 'employee_deletion', ?, ?, ?
           WHERE changes()=1`,
        )
        .bind(
          actor.email,
          parsed.data.requestId,
          JSON.stringify({
            employeeId,
            employeeCreatedAt: employee.createdAt,
            employeeStatus: employee.status,
          }),
          now,
        ),
      d1
        .prepare(
          `DELETE FROM employee_profile_records WHERE employee_id=? AND kind='skill'
         AND EXISTS (SELECT 1 FROM audit_events WHERE entity_id=? AND action='employee.permanently_deleted')
         AND NOT EXISTS (SELECT 1 FROM employee_profile_records WHERE employee_id=? AND kind<>'skill')`,
        )
        .bind(employeeId, parsed.data.requestId, employeeId),
      d1
        .prepare(
          `DELETE FROM employment_history WHERE employee_id=?
           AND change_reason='Employee created'
           AND NOT EXISTS (SELECT 1 FROM users WHERE employee_id=?)
           AND EXISTS (SELECT 1 FROM audit_events WHERE entity_id=? AND action='employee.permanently_deleted')`,
        )
        .bind(employeeId, employeeId, parsed.data.requestId),
      d1
        .prepare(
          `DELETE FROM leave_balances WHERE employee_id=? AND used=0 AND adjustment=0
           AND NOT EXISTS (SELECT 1 FROM users WHERE employee_id=?)
           AND EXISTS (SELECT 1 FROM audit_events WHERE entity_id=? AND action='employee.permanently_deleted')`,
        )
        .bind(employeeId, employeeId, parsed.data.requestId),
      d1
        .prepare(
          `DELETE FROM employees WHERE id=?
           AND NOT EXISTS (SELECT 1 FROM users WHERE employee_id=employees.id)
           AND EXISTS (SELECT 1 FROM audit_events WHERE entity_id=? AND action='employee.permanently_deleted')`,
        )
        .bind(employeeId, parsed.data.requestId),
    ]);
    if (Number(results[11]?.meta?.changes ?? 0) !== 1) {
      return Response.json(
        {
          error:
            "The employee record could not be safely removed. No data was changed.",
        },
        { status: 409 },
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      /foreign key|protected super administrator|constraint failed/i.test(
        message,
      )
    ) {
      return Response.json(
        {
          error:
            "This employee has linked HR, financial, document, asset, or shared business records and cannot be permanently deleted.",
        },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "Could not safely remove the employee. No data was changed." },
      { status: 500 },
    );
  }
}

type EmploymentMutationInput =
  | ReturnType<typeof employmentChangeEmployeeSchema.parse>
  | ReturnType<typeof employmentCorrectionEmployeeSchema.parse>;

async function updateEmploymentFields(
  employeeId: number,
  input: EmploymentMutationInput,
  actorEmail: string,
) {
  if (!Number.isInteger(employeeId) || employeeId <= 0)
    return Response.json({ error: "Invalid employee id." }, { status: 400 });

  const db = getDb();
  const [current] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!current)
    return Response.json({ error: "Employee not found." }, { status: 404 });
  if (current.status === "inactive") {
    return Response.json(
      {
        error:
          "Inactive employees cannot be reactivated through generic profile updates.",
      },
      { status: 409 },
    );
  }
  if (input.managerId === employeeId) {
    return Response.json(
      { error: "A person cannot manage themselves." },
      { status: 400 },
    );
  }

  if ("employmentChange" in input) {
    const effectiveDate = input.effectiveDate;
    const { today } = getDateContext();
    if (effectiveDate < current.startDate || effectiveDate > today) {
      return Response.json(
        { error: "Choose an effective date between the start date and today." },
        { status: 400 },
      );
    }
    const history = await db
      .select()
      .from(employmentHistory)
      .where(eq(employmentHistory.employeeId, employeeId));
    const latestStateDate = latestEmploymentStateChangeDate(
      history,
      current.startDate,
    );
    const conflict = employmentChangeConflict({
      status: current.status,
      effectiveDate,
      latestStateChangeDate: latestStateDate,
    });
    if (conflict === "backdated") {
      return Response.json(
        {
          error:
            "The effective date cannot be earlier than the latest employment change.",
        },
        { status: 409 },
      );
    }
  }

  let references;
  try {
    references = await resolveEmployeeReferences({
      division: input.division,
      department: input.department,
      team: input.team,
      divisionUnitId: input.divisionUnitId,
      departmentUnitId: input.departmentUnitId,
      teamUnitId: input.teamUnitId,
      jobTitle: input.jobTitle,
      level: input.level,
      employmentType: input.employmentType || current.employmentType,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid profile data.",
      },
      { status: 400 },
    );
  }

  const changed = hasEmploymentStateChanged(current, {
    jobTitle: references.canonical.jobTitle,
    department: references.canonical.department,
    division: references.canonical.division,
    team: references.canonical.team,
    level: references.canonical.level,
    location: input.location,
    managerId: input.managerId,
    employmentType: references.canonical.employmentType,
    status: current.status,
  });
  if ("employmentChange" in input && !changed) {
    return Response.json(
      { error: "Change at least one employment field before saving." },
      { status: 409 },
    );
  }
  const [manager] = input.managerId
    ? await db
        .select({
          firstName: employees.firstName,
          lastName: employees.lastName,
        })
        .from(employees)
        .where(eq(employees.id, input.managerId))
        .limit(1)
    : [];
  const d1 = getD1();
  const statements = [
    d1
      .prepare(
        "UPDATE employees SET job_title=?,department=?,employment_type=?,manager_id=?,manager_name=?,division=?,team=?,level=?,location=?,division_unit_id=?,department_unit_id=?,team_unit_id=?,position_value_id=?,level_value_id=?,employment_type_id=? WHERE id=? AND status<>'inactive'",
      )
      .bind(
        references.canonical.jobTitle,
        references.canonical.department,
        references.canonical.employmentType,
        input.managerId,
        manager ? `${manager.firstName} ${manager.lastName}` : null,
        references.canonical.division,
        references.canonical.team,
        references.canonical.level,
        input.location,
        references.division.id,
        references.department.id,
        references.team?.id ?? null,
        references.position.id,
        references.level?.id ?? null,
        references.employmentType.id,
        employeeId,
      ),
  ];
  if ("employmentChange" in input) {
    statements.push(
      d1
        .prepare(
          "INSERT INTO employment_history (employee_id,effective_date,job_title,department,division,team,level,location,manager_id,employment_type,status,change_reason) SELECT id,?,?,?,?,?,?,?,?,?,?,? FROM employees WHERE id=? AND status<>'inactive'",
        )
        .bind(
          input.effectiveDate,
          references.canonical.jobTitle,
          references.canonical.department,
          references.canonical.division,
          references.canonical.team,
          references.canonical.level,
          input.location,
          input.managerId,
          references.canonical.employmentType,
          current.status,
          input.changeReason,
          employeeId,
        ),
    );
  }
  statements.push(
    d1
      .prepare(
        "INSERT INTO audit_events (actor_email,action,entity_type,entity_id,details) VALUES (?,?,'employee',?,?)",
      )
      .bind(
        actorEmail,
        "employmentChange" in input
          ? "employee.employment_changed"
          : "employee.employment_corrected",
        String(employeeId),
        "employmentChange" in input
          ? "Employment change recorded"
          : "Current employment details corrected",
      ),
  );

  try {
    const result = await d1.batch(statements);
    if (!result[0]?.meta?.changes) {
      return Response.json(
        {
          error:
            "Inactive employees cannot be reactivated through generic profile updates.",
        },
        { status: 409 },
      );
    }
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    return Response.json({ employee });
  } catch {
    return Response.json(
      { error: "Could not update the employee's employment details." },
      { status: 500 },
    );
  }
}
