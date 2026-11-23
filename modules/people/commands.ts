import { getD1, getDb } from "@/db";
import { eq, sql } from "drizzle-orm";
import { employees, leaveTypes, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import type { z } from "zod";
import type { createEmployeeSchema } from "@/modules/people/contracts";
import { ApplicationError } from "@/modules/shared/application-error";
import { getDateContext } from "@/modules/shared/date";
import { resolveEmployeeReferences } from "@/modules/people/reference-data";
import { getEmployeeDefaults } from "@/modules/settings/system";
import { calculateInitialAnnualAllowance } from "@/modules/leave/domain";
import { resolveProbationEnd } from "@/modules/people/dates";

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export async function createEmployee(
  actor: CurrentUser,
  input: CreateEmployeeInput,
) {
  const db = getDb();
  const normalizedEmail = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(sql`lower(${employees.email}) = ${normalizedEmail}`)
    .limit(1);
  const [existingAccount] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(trim(${users.email})) = ${normalizedEmail}`)
    .limit(1);
  if (existing || existingAccount) {
    throw new ApplicationError(
      "A person with this email already exists.",
      409,
      "employee_email_exists",
    );
  }
  const defaults = await getEmployeeDefaults();
  const probationEnd = resolveProbationEnd(
    input.startDate,
    input.probationEnd,
    defaults.probationMonths,
  );
  const references = await resolveEmployeeReferences({
    division: input.division || defaults.division,
    department: input.department,
    team: input.team,
    divisionUnitId: input.divisionUnitId,
    departmentUnitId: input.departmentUnitId,
    teamUnitId: input.teamUnitId,
    jobTitle: input.jobTitle,
    level: input.level,
    employmentType: defaults.employmentType,
  });
  const division = references.canonical.division;

  try {
    const { year } = getDateContext();
    const leaveTypeRows = await db.select().from(leaveTypes);
    const d1 = getD1();
    await d1.batch([
      d1
        .prepare(
          "INSERT INTO employees (first_name,last_name,email,job_title,department,location,default_work_mode,start_date,division,team,level,probation_end,employment_type,status,division_unit_id,department_unit_id,team_unit_id,position_value_id,level_value_id,employment_type_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          input.firstName,
          input.lastName,
          normalizedEmail,
          references.canonical.jobTitle,
          references.canonical.department,
          defaults.location,
          defaults.workMode,
          input.startDate,
          division,
          references.canonical.team,
          references.canonical.level,
          probationEnd,
          references.canonical.employmentType,
          "active",
          references.division.id,
          references.department.id,
          references.team?.id ?? null,
          references.position.id,
          references.level?.id ?? null,
          references.employmentType.id,
        ),
      d1
        .prepare(
          "INSERT INTO users (email,role,employee_id) SELECT email,'employee',id FROM employees WHERE email=?",
        )
        .bind(normalizedEmail),
      d1
        .prepare(
          "INSERT INTO employment_history (employee_id,effective_date,job_title,department,division,team,level,location,manager_id,employment_type,status,change_reason) SELECT id,?,?,?,?,?,?,?,?,?,?,? FROM employees WHERE email=?",
        )
        .bind(
          input.startDate,
          references.canonical.jobTitle,
          references.canonical.department,
          division,
          references.canonical.team,
          references.canonical.level,
          defaults.location,
          null,
          references.canonical.employmentType,
          "active",
          "Employee created",
          normalizedEmail,
        ),
      ...leaveTypeRows.map((leaveType) =>
        d1
          .prepare(
            "INSERT INTO leave_balances (employee_id,leave_type_id,year,allowance,used,adjustment) SELECT id,?,?,?,0,0 FROM employees WHERE email=?",
          )
          .bind(
            leaveType.id,
            year,
            calculateInitialAnnualAllowance(
              leaveType.defaultAllowance,
              input.startDate,
              year,
            ),
            normalizedEmail,
          ),
      ),
      d1
        .prepare(
          "INSERT INTO audit_events (actor_email,action,entity_type,entity_id,details) SELECT ?,'employee.created','employee',CAST(id AS TEXT),? FROM employees WHERE email=?",
        )
        .bind(
          actor.email,
          `${input.firstName} ${input.lastName} joined ${references.canonical.department}`,
          normalizedEmail,
        ),
    ]);
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.email, normalizedEmail))
      .limit(1);
    if (!employee) throw new Error("employee batch did not create a record");

    return employee;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) {
      throw new ApplicationError(
        "A person with this email already exists.",
        409,
        "employee_email_exists",
      );
    }
    throw new ApplicationError(
      "Could not create the employee.",
      500,
      "employee_create_failed",
    );
  }
}
