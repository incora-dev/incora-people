import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { employees, users } from "@/db/schema";
import { isRole } from "@/lib/roles";
import {
  isLoginAccountEligible,
  uniqueNormalizedEmailMatch,
} from "@/modules/people/identity-policy";

/** The account resolved from the canonical users row, never from an email-only fallback. */
export type AdmittedAccount = {
  userId: number;
  email: string;
  role: "super_admin" | "hr_admin" | "manager" | "employee";
  employeeId: number | null;
  providerSubject: string | null;
  enabled: boolean;
  employeeStatus: string | null;
};

/**
 * Resolve an active account for an authentication event. Unknown accounts,
 * disabled accounts and terminated employees fail closed.
 */
export async function findAdmittedAccount(
  email: string,
  providerSubject?: string,
): Promise<AdmittedAccount | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const rows = await getDb()
    .select({
      userId: users.id,
      email: users.email,
      role: users.role,
      employeeId: users.employeeId,
      providerSubject: users.providerSubject,
      enabled: users.enabled,
      employeeStatus: employees.status,
    })
    .from(users)
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(sql`lower(trim(${users.email})) = ${normalizedEmail}`)
    .limit(2);

  const row = uniqueNormalizedEmailMatch(normalizedEmail, rows);
  return admittedRow(row ?? undefined, providerSubject);
}

export async function findAdmittedAccountById(
  userId: number,
  providerSubject?: string,
): Promise<AdmittedAccount | null> {
  const [row] = await getDb()
    .select({
      userId: users.id,
      email: users.email,
      role: users.role,
      employeeId: users.employeeId,
      providerSubject: users.providerSubject,
      enabled: users.enabled,
      employeeStatus: employees.status,
    })
    .from(users)
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(eq(users.id, userId))
    .limit(1);

  return admittedRow(row, providerSubject);
}

/** Bind a Google subject once, while remaining safe under concurrent callbacks. */
export async function bindProviderSubject(
  userId: number,
  providerSubject: string,
) {
  const normalizedSubject = providerSubject.trim();
  if (!normalizedSubject) return false;
  const [updated] = await getDb()
    .update(users)
    .set({ providerSubject: normalizedSubject })
    .where(
      and(
        eq(users.id, userId),
        or(
          isNull(users.providerSubject),
          eq(users.providerSubject, normalizedSubject),
        ),
      ),
    )
    .returning({ providerSubject: users.providerSubject });
  return Boolean(updated);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function admittedRow(
  row:
    | {
        userId: number;
        email: string;
        role: string;
        employeeId: number | null;
        providerSubject: string | null;
        enabled: boolean;
        employeeStatus: string | null;
      }
    | undefined,
  providerSubject?: string,
) {
  if (!row || !isLoginAccountEligible(row) || !isRole(row.role)) {
    return null;
  }
  if (
    providerSubject !== undefined &&
    row.providerSubject !== null &&
    row.providerSubject !== providerSubject
  ) {
    return null;
  }
  return {
    userId: row.userId,
    email: row.email.trim().toLowerCase(),
    role: row.role,
    employeeId: row.employeeId,
    providerSubject: row.providerSubject,
    enabled: row.enabled,
    employeeStatus: row.employeeStatus,
  } satisfies AdmittedAccount;
}
