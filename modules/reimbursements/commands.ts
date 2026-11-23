import { and, eq, ne, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { reimbursementPolicies, reimbursementRequests } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { getApprovalRecipientEmails } from "@/modules/approvals/recipients";
import {
  buildInAppNotificationStatements,
  buildPushNotificationStatements,
} from "@/modules/notifications/outbox";
import type { CreateReimbursementInput } from "@/modules/reimbursements/contracts";
import { ApplicationError } from "@/modules/shared/application-error";
import { yearFromDate } from "@/modules/shared/date";

export async function createReimbursement(
  user: CurrentUser,
  input: CreateReimbursementInput,
) {
  if (!user.employeeId) {
    throw new ApplicationError(
      "Account is not linked to an employee.",
      403,
      "employee_account_required",
    );
  }

  const db = getDb();
  const idempotencyKey = input.idempotencyKey?.trim().slice(0, 160) || null;
  // Every command gets a server-generated key as well. This gives the
  // atomic batch a stable lookup target even when an older client did not
  // send an Idempotency-Key header.
  const commandKey = idempotencyKey ?? crypto.randomUUID();
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(reimbursementRequests)
      .where(
        and(
          eq(reimbursementRequests.employeeId, user.employeeId),
          eq(reimbursementRequests.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return existing;
  }
  const amountCents = Math.round(input.amount * 100);
  const expenseYear = yearFromDate(input.expenseDate);
  const [policy] = await db
    .select()
    .from(reimbursementPolicies)
    .where(eq(reimbursementPolicies.enabled, true))
    .limit(1);
  if (!policy) {
    throw new ApplicationError(
      "Reimbursement policy is disabled.",
      409,
      "reimbursement_policy_disabled",
    );
  }
  if (!expenseYear) {
    throw new ApplicationError(
      "Choose a valid expense date.",
      400,
      "invalid_expense_date",
    );
  }
  if (policy.requiresReceipt && !input.receiptUrl) {
    throw new ApplicationError(
      "A receipt link is required by policy.",
      400,
      "receipt_required",
    );
  }
  if (amountCents > policy.perRequestLimit) {
    throw new ApplicationError(
      `The per-request limit is ${money(policy.perRequestLimit, policy.currency)}.`,
      409,
      "per_request_limit_exceeded",
    );
  }

  const [usage] = await db
    .select({
      count: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${reimbursementRequests.amountCents}), 0)`,
    })
    .from(reimbursementRequests)
    .where(
      and(
        eq(reimbursementRequests.employeeId, user.employeeId),
        sql`${reimbursementRequests.expenseDate} LIKE ${`${expenseYear}-%`}`,
        ne(reimbursementRequests.status, "rejected"),
        ne(reimbursementRequests.status, "withdrawn"),
      ),
    );

  if (Number(usage?.count ?? 0) >= policy.maxRequestsPerYear) {
    throw new ApplicationError(
      `The annual limit of ${policy.maxRequestsPerYear} requests has been reached.`,
      409,
      "annual_request_limit_exceeded",
    );
  }
  if (Number(usage?.total ?? 0) + amountCents > policy.annualLimit) {
    throw new ApplicationError(
      `The annual reimbursement limit is ${money(policy.annualLimit, policy.currency)}.`,
      409,
      "annual_amount_limit_exceeded",
    );
  }

  const recipientEmails = policy.requiresApproval
    ? await getApprovalRecipientEmails(user.employeeId, "expenses")
    : [];
  const message = `${user.email} submitted ${money(amountCents, policy.currency)} for ${input.category}.`;
  const d1 = getD1();
  const statements = [
    d1
      .prepare(
        `INSERT INTO reimbursement_requests
           (employee_id, category, amount_cents, currency, expense_date,
            description, idempotency_key, receipt_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.employeeId,
        input.category,
        amountCents,
        policy.currency,
        input.expenseDate,
        input.description,
        commandKey,
        input.receiptUrl || null,
        policy.requiresApproval ? "pending" : "approved",
      ),
    d1
      .prepare(
        `INSERT INTO audit_events
           (actor_email, action, entity_type, entity_id, details)
         SELECT ?, 'reimbursement.requested', 'reimbursement_request',
                CAST(id AS TEXT), ?
         FROM reimbursement_requests
         WHERE employee_id=? AND idempotency_key=?
         LIMIT 1`,
      )
      .bind(
        user.email,
        `${input.category}: ${money(amountCents, policy.currency)}`,
        user.employeeId,
        commandKey,
      ),
  ];
  if (recipientEmails.length) {
    statements.push(
      ...buildInAppNotificationStatements(d1, recipientEmails, {
        title: "New reimbursement request",
        body: message,
        href: "/expenses",
      }),
      ...buildPushNotificationStatements(
        d1,
        recipientEmails,
        {
          title: "New reimbursement request",
          body: message,
          href: "/expenses",
        },
        `reimbursement.requested:${commandKey}`,
      ),
    );
  }
  try {
    await d1.batch(statements);
  } catch (error) {
    if (String(error).includes("reimbursement_policy_limit")) {
      throw new ApplicationError(
        "The reimbursement policy limit was reached. Refresh and try again.",
        409,
        "reimbursement_policy_limit",
      );
    }
    if (idempotencyKey && String(error).includes("UNIQUE")) {
      const [existing] = await db
        .select()
        .from(reimbursementRequests)
        .where(
          and(
            eq(reimbursementRequests.employeeId, user.employeeId),
            eq(reimbursementRequests.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) return existing;
    }
    throw error;
  }

  const [created] = await db
    .select()
    .from(reimbursementRequests)
    .where(
      and(
        eq(reimbursementRequests.employeeId, user.employeeId),
        eq(reimbursementRequests.idempotencyKey, commandKey),
      ),
    )
    .limit(1);
  if (!created) throw new Error("Reimbursement request was not persisted.");

  // Do not expose the internal key that was generated for legacy clients.
  return { ...created, idempotencyKey };
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
