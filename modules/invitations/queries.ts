import { desc, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  employeeInvitationAttempts,
  employees,
  protectedAdminAccounts,
  users,
} from "@/db/schema";
import { getEmployeeInvitationConfig } from "@/lib/runtime-config";
import {
  invitationEligibilityCode,
  normalizeInvitationEmail,
  type InvitationAccount,
  type InvitationEmployee,
} from "@/modules/invitations/domain";

export type EmployeeInvitationAttemptSummary = {
  id: string;
  status: "sending" | "sent" | "failed" | "uncertain";
  requestedAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  failureCode: string | null;
  staleSending: boolean;
  retrySafe: boolean;
};

export type EmployeeInvitationSummary = {
  employeeExists: boolean;
  eligible: boolean;
  eligibilityCode: string | null;
  deliveryConfigured: boolean;
  loginActivity: "logged_in" | "not_logged_in" | "unknown";
  lastLoginAt: string | null;
  recentAttempts: EmployeeInvitationAttemptSummary[];
};

export async function loadEmployeeInvitationTarget(employeeId: number) {
  const db = getDb();
  const [employeeRow] = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      email: employees.email,
      status: employees.status,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  const employee = (employeeRow ?? null) as InvitationEmployee | null;
  if (!employee) {
    return {
      employee: null,
      accounts: [] as InvitationAccount[],
      accountLocale: "uk",
      accountCreatedAt: null as string | null,
      lastLoginAt: null as string | null,
      eligibilityCode: "employee_missing" as const,
    };
  }

  const candidateAccounts = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      enabled: users.enabled,
      employeeId: users.employeeId,
      protectedAdminId: protectedAdminAccounts.userId,
      locale: users.locale,
      accountCreatedAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .leftJoin(
      protectedAdminAccounts,
      eq(protectedAdminAccounts.userId, users.id),
    )
    .where(
      or(
        eq(users.employeeId, employee.id),
        sql`lower(trim(${users.email})) = ${normalizeInvitationEmail(employee.email)}`,
      ),
    );
  const accounts: InvitationAccount[] = candidateAccounts.map((account) => ({
    id: account.id,
    email: account.email,
    role: account.role,
    enabled: account.enabled,
    employeeId: account.employeeId,
    protectedAdmin: account.protectedAdminId !== null,
  }));
  const account = candidateAccounts.length === 1 ? candidateAccounts[0] : null;

  return {
    employee,
    accounts,
    accountLocale: account?.locale ?? "uk",
    accountCreatedAt: account?.accountCreatedAt ?? null,
    lastLoginAt: account?.lastLoginAt ?? null,
    eligibilityCode: invitationEligibilityCode({ employee, accounts }),
  };
}

export async function getEmployeeInvitationSummary(
  employeeId: number,
): Promise<EmployeeInvitationSummary> {
  const target = await loadEmployeeInvitationTarget(employeeId);
  const latestAttempts = target.employee
    ? await getDb()
        .select({
          id: employeeInvitationAttempts.id,
          status: employeeInvitationAttempts.status,
          requestedAt: employeeInvitationAttempts.requestedAt,
          updatedAt: employeeInvitationAttempts.updatedAt,
          acceptedAt: employeeInvitationAttempts.acceptedAt,
          failureCode: employeeInvitationAttempts.failureCode,
        })
        .from(employeeInvitationAttempts)
        .where(eq(employeeInvitationAttempts.employeeId, employeeId))
        .orderBy(
          desc(employeeInvitationAttempts.requestedAt),
          desc(employeeInvitationAttempts.id),
        )
        .limit(5)
    : [];
  const loginActivity = target.lastLoginAt
    ? "logged_in"
    : target.accountCreatedAt
      ? "not_logged_in"
      : "unknown";
  return {
    employeeExists: Boolean(target.employee),
    eligible: Boolean(target.employee && target.eligibilityCode === null),
    eligibilityCode: target.eligibilityCode,
    deliveryConfigured: getEmployeeInvitationConfig().enabled,
    loginActivity,
    lastLoginAt: target.lastLoginAt,
    recentAttempts: latestAttempts.map((attempt) => {
      const age = Date.now() - new Date(attempt.requestedAt).getTime();
      return {
        ...attempt,
        status: attempt.status as EmployeeInvitationAttemptSummary["status"],
        staleSending:
          attempt.status === "sending" &&
          Date.now() - new Date(attempt.updatedAt).getTime() >= 90_000,
        retrySafe:
          age >= 0 &&
          age < 23 * 60 * 60 * 1000 &&
          (attempt.status === "uncertain" ||
            (attempt.status === "sending" &&
              Date.now() - new Date(attempt.updatedAt).getTime() >= 90_000)),
      };
    }),
  };
}
