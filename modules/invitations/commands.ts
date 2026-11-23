import { getD1 } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { getEmployeeInvitationConfig } from "@/lib/runtime-config";
import {
  buildEmployeeInvitationPayload,
  invitationEligibilityCode,
  normalizeInvitationEmail,
} from "@/modules/invitations/domain";
import { loadEmployeeInvitationTarget } from "@/modules/invitations/queries";
import { sendInvitationEmail } from "@/modules/invitations/provider";
import { ApplicationError } from "@/modules/shared/application-error";

const SEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS_PER_HOUR = 5;
const MAX_ATTEMPTS_PER_ACTOR_PER_HOUR = 30;
const STALE_SENDING_MS = 90_000;
// Resend retains idempotency keys for 24 hours. Leave a safety margin before
// that window so an uncertain result is never retried after deduplication ends.
const SAFE_PROVIDER_RETRY_MS = 23 * 60 * 60 * 1000;

type InvitationAttempt = {
  id: string;
  employee_id: number | null;
  account_user_id: number | null;
  target_email: string;
  status: "sending" | "sent" | "failed" | "uncertain";
  payload_json: string;
  requested_at: string;
  updated_at: string;
  accepted_at: string | null;
  failure_code: string | null;
};

export type InvitationCommandResult = {
  attemptId: string;
  status: InvitationAttempt["status"];
  acceptedAt: string | null;
  failureCode: string | null;
  retrySafe: boolean;
};

export async function sendEmployeeInvitation(input: {
  actor: CurrentUser;
  employeeId: number;
  attemptId: string;
  acknowledgeReminder: boolean;
}): Promise<InvitationCommandResult> {
  if (input.actor.isPreview || !input.actor.userId) {
    throw new ApplicationError(
      "HR administrator access is required.",
      403,
      "invitation_forbidden",
    );
  }

  const target = await loadEmployeeInvitationTarget(input.employeeId);
  if (!target.employee) {
    throw new ApplicationError("Employee not found.", 404, "employee_missing");
  }
  const eligibilityCode = invitationEligibilityCode({
    employee: target.employee,
    accounts: target.accounts,
  });
  if (eligibilityCode) {
    throw new ApplicationError(
      eligibilityMessage(eligibilityCode),
      eligibilityCode === "employee_missing" ? 404 : 409,
      eligibilityCode,
    );
  }

  const account = target.accounts[0];
  if (target.lastLoginAt && !input.acknowledgeReminder) {
    throw new ApplicationError(
      "This employee has already signed in. Confirm that this invitation is only a reminder.",
      409,
      "invitation_reminder_confirmation_required",
    );
  }

  const config = getEmployeeInvitationConfig();
  if (!config.enabled) {
    throw new ApplicationError(
      "Employee invitation delivery is not configured.",
      503,
      "invitation_delivery_not_configured",
    );
  }

  const d1 = getD1();
  const now = new Date();
  const nowIso = now.toISOString();
  const existing = await d1
    .prepare("SELECT * FROM employee_invitation_attempts WHERE id = ? LIMIT 1")
    .bind(input.attemptId)
    .first<InvitationAttempt>();
  if (existing) {
    if (
      existing.employee_id !== input.employeeId ||
      existing.account_user_id !== account.id ||
      normalizeInvitationEmail(existing.target_email) !==
        normalizeInvitationEmail(account.email)
    ) {
      throw new ApplicationError(
        "This invitation request does not match the employee account.",
        409,
        "invitation_request_mismatch",
      );
    }
    if (existing.status === "sent" || existing.status === "failed") {
      return toCommandResult(existing, false);
    }
    const ageMs = Math.max(
      0,
      now.getTime() - new Date(existing.requested_at).getTime(),
    );
    if (ageMs >= SAFE_PROVIDER_RETRY_MS) {
      if (existing.status === "sending") {
        await markUncertain(existing, "provider_outcome_unknown");
      }
      const latest = await loadAttempt(input.attemptId);
      return toCommandResult(latest ?? existing, false);
    }
    if (
      existing.status === "sending" &&
      now.getTime() - new Date(existing.updated_at).getTime() < STALE_SENDING_MS
    ) {
      return toCommandResult(existing, true);
    }
    const claimed = await claimExistingAttempt(
      existing,
      nowIso,
      input.actor.userId,
      input.actor.email,
    );
    if (!claimed) {
      const latest = await loadAttempt(input.attemptId);
      return toCommandResult(latest ?? existing, true);
    }
    return dispatchAttempt(claimed, config, input.actor);
  }

  const targetEmail = normalizeInvitationEmail(account.email);
  const payload = buildEmployeeInvitationPayload({
    from: config.from,
    firstName: target.employee.firstName,
    email: targetEmail,
    locale: target.accountLocale,
    publicOrigin: config.publicOrigin,
  });
  const oldestAllowed = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const cooldownSince = new Date(
    now.getTime() - SEND_COOLDOWN_MS,
  ).toISOString();
  const statements = [
    d1
      .prepare(
        `INSERT INTO employee_invitation_attempts (
          id, employee_id, account_user_id, target_email, provider, status,
          payload_json, requested_at, updated_at, actor_user_id, actor_email
        )
        SELECT ?, employee.id, account.id, ?, 'resend', 'sending', ?, ?, ?, ?, ?
          FROM employees employee
          JOIN users account ON account.id=?
         WHERE employee.id=?
           AND employee.status<>'inactive'
           AND account.employee_id=employee.id
           AND account.role IN ('employee','manager','hr_admin')
           AND account.enabled=1
           AND lower(trim(employee.email))=?
           AND lower(trim(account.email))=lower(trim(employee.email))
           AND NOT EXISTS (SELECT 1 FROM protected_admin_accounts protected WHERE protected.user_id=account.id)
           AND NOT EXISTS (
             SELECT 1 FROM employee_invitation_attempts open_attempt
              WHERE open_attempt.employee_id=employee.id
                AND open_attempt.status IN ('sending','uncertain')
           )
           AND NOT EXISTS (
             SELECT 1 FROM employee_invitation_attempts recent
              WHERE recent.employee_id=employee.id
                AND recent.requested_at>=?
           )
           AND (SELECT COUNT(*) FROM employee_invitation_attempts hourly
                 WHERE hourly.employee_id=employee.id AND hourly.requested_at>=?) < ?
           AND (SELECT COUNT(*) FROM employee_invitation_attempts hourly_actor
                 WHERE hourly_actor.actor_user_id=? AND hourly_actor.requested_at>=?) < ?`,
      )
      .bind(
        input.attemptId,
        targetEmail,
        JSON.stringify(payload),
        nowIso,
        nowIso,
        input.actor.userId,
        input.actor.email,
        account.id,
        input.employeeId,
        targetEmail,
        cooldownSince,
        oldestAllowed,
        MAX_ATTEMPTS_PER_HOUR,
        input.actor.userId,
        oldestAllowed,
        MAX_ATTEMPTS_PER_ACTOR_PER_HOUR,
      ),
    d1
      .prepare(
        `INSERT INTO audit_events (actor_email, action, entity_type, entity_id, details)
         SELECT ?, 'employee.invitation_requested', 'employee', CAST(employee_id AS TEXT), ?
           FROM employee_invitation_attempts WHERE id=?`,
      )
      .bind(
        input.actor.email,
        JSON.stringify({
          attemptId: input.attemptId,
          actorUserId: input.actor.userId,
        }),
        input.attemptId,
      ),
  ];

  let inserted = false;
  try {
    const results = await d1.batch(statements);
    inserted = Number(results[0]?.meta.changes ?? 0) === 1;
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }
  if (!inserted) {
    const latest = await d1
      .prepare(
        `SELECT * FROM employee_invitation_attempts
          WHERE employee_id=? ORDER BY requested_at DESC, id DESC LIMIT 1`,
      )
      .bind(input.employeeId)
      .first<InvitationAttempt>();
    if (latest?.status === "sending" || latest?.status === "uncertain") {
      throw new ApplicationError(
        "An invitation attempt is already in progress or has an uncertain result.",
        409,
        "invitation_attempt_in_progress",
      );
    }
    throw new ApplicationError(
      "Please wait before sending another invitation, or try again later.",
      429,
      "invitation_rate_limited",
    );
  }

  const attempt = await loadAttempt(input.attemptId);
  if (!attempt) throw new Error("Invitation attempt was not persisted.");
  return dispatchAttempt(attempt, config, input.actor);
}

async function dispatchAttempt(
  attempt: InvitationAttempt,
  config: ReturnType<typeof getEmployeeInvitationConfig>,
  actor: CurrentUser,
): Promise<InvitationCommandResult> {
  let payload;
  try {
    payload = JSON.parse(attempt.payload_json);
  } catch {
    await markUncertain(attempt, "stored_payload_invalid");
    const latest = await loadAttempt(attempt.id);
    return toCommandResult(latest ?? attempt, false);
  }
  const providerResult = await sendInvitationEmail(
    { attemptId: attempt.id, payload },
    { enabled: config.enabled, apiKey: config.apiKey },
  );
  const now = new Date().toISOString();
  const d1 = getD1();
  if (providerResult.kind === "accepted") {
    await d1.batch([
      d1
        .prepare(
          `UPDATE employee_invitation_attempts
              SET status='sent', provider_message_id=?, accepted_at=?, updated_at=?,
                  failed_at=NULL, uncertain_at=NULL, failure_code=NULL
            WHERE id=? AND status='sending'`,
        )
        .bind(providerResult.messageId, now, now, attempt.id),
      d1
        .prepare(
          `INSERT INTO audit_events (actor_email, action, entity_type, entity_id, details)
           SELECT ?, 'employee.invitation_accepted', 'employee', CAST(employee_id AS TEXT), ?
             FROM employee_invitation_attempts WHERE id=? AND status='sent'`,
        )
        .bind(
          actor.email,
          JSON.stringify({ attemptId: attempt.id, actorUserId: actor.userId }),
          attempt.id,
        ),
    ]);
  } else if (providerResult.kind === "rejected") {
    await d1.batch([
      d1
        .prepare(
          `UPDATE employee_invitation_attempts
              SET status='failed', failed_at=?, updated_at=?, accepted_at=NULL,
                  uncertain_at=NULL, failure_code=?
            WHERE id=? AND status='sending'`,
        )
        .bind(now, now, providerResult.failureCode, attempt.id),
      d1
        .prepare(
          `INSERT INTO audit_events (actor_email, action, entity_type, entity_id, details)
           SELECT ?, 'employee.invitation_failed', 'employee', CAST(employee_id AS TEXT), ?
             FROM employee_invitation_attempts WHERE id=? AND status='failed'`,
        )
        .bind(
          actor.email,
          JSON.stringify({ attemptId: attempt.id, actorUserId: actor.userId }),
          attempt.id,
        ),
    ]);
  } else {
    await d1.batch([
      d1
        .prepare(
          `UPDATE employee_invitation_attempts
              SET status='uncertain', uncertain_at=?, updated_at=?, accepted_at=NULL,
                  failed_at=NULL, failure_code=?
            WHERE id=? AND status='sending'`,
        )
        .bind(now, now, providerResult.failureCode, attempt.id),
      d1
        .prepare(
          `INSERT INTO audit_events (actor_email, action, entity_type, entity_id, details)
           SELECT ?, 'employee.invitation_uncertain', 'employee', CAST(employee_id AS TEXT), ?
             FROM employee_invitation_attempts WHERE id=? AND status='uncertain'`,
        )
        .bind(
          actor.email,
          JSON.stringify({ attemptId: attempt.id, actorUserId: actor.userId }),
          attempt.id,
        ),
    ]);
  }
  const latest = await loadAttempt(attempt.id);
  if (!latest)
    throw new Error("Invitation attempt disappeared after delivery.");
  return toCommandResult(latest, latest.status === "uncertain");
}

async function claimExistingAttempt(
  attempt: InvitationAttempt,
  now: string,
  actorUserId: number,
  actorEmail: string,
) {
  const d1 = getD1();
  const results = await d1.batch([
    d1
      .prepare(
        `UPDATE employee_invitation_attempts
          SET status='sending', updated_at=?, uncertain_at=NULL, failure_code=NULL
        WHERE id=? AND updated_at=? AND (
          status='uncertain' OR
          (status='sending' AND updated_at<=?)
        )`,
      )
      .bind(
        now,
        attempt.id,
        attempt.updated_at,
        new Date(Date.now() - STALE_SENDING_MS).toISOString(),
      ),
    d1
      .prepare(
        `INSERT INTO audit_events (actor_email, action, entity_type, entity_id, details)
       SELECT ?, 'employee.invitation_retry', 'employee', CAST(employee_id AS TEXT), ?
         FROM employee_invitation_attempts WHERE id=? AND status='sending'`,
      )
      .bind(
        actorEmail,
        JSON.stringify({ attemptId: attempt.id, actorUserId }),
        attempt.id,
      ),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) return null;
  return { ...attempt, status: "sending" as const, updated_at: now };
}

async function markUncertain(attempt: InvitationAttempt, failureCode: string) {
  const now = new Date().toISOString();
  await getD1()
    .prepare(
      `UPDATE employee_invitation_attempts
          SET status='uncertain', uncertain_at=?, updated_at=?, failure_code=?
        WHERE id=? AND status='sending' AND updated_at=?`,
    )
    .bind(now, now, failureCode, attempt.id, attempt.updated_at)
    .run();
}

async function loadAttempt(attemptId: string) {
  return getD1()
    .prepare("SELECT * FROM employee_invitation_attempts WHERE id=? LIMIT 1")
    .bind(attemptId)
    .first<InvitationAttempt>();
}

function toCommandResult(
  attempt: InvitationAttempt,
  retrySafe: boolean,
): InvitationCommandResult {
  return {
    attemptId: attempt.id,
    status: attempt.status,
    acceptedAt: attempt.accepted_at,
    failureCode: attempt.failure_code,
    retrySafe,
  };
}

function eligibilityMessage(
  code: NonNullable<ReturnType<typeof invitationEligibilityCode>>,
) {
  const messages = {
    employee_missing: "Employee not found.",
    account_missing: "This employee does not have a linked system account.",
    identity_ambiguous:
      "The employee and account relationship is ambiguous; the invitation was not sent.",
    email_mismatch:
      "The employee work email and linked account email do not match.",
    invalid_email: "The employee does not have a valid work email.",
    account_disabled:
      "System access is disabled. Enable access before sending an invitation.",
    employee_terminated:
      "Terminated employees cannot receive a system invitation.",
    system_account:
      "Invitations cannot be sent to protected or non-employee system accounts.",
  };
  return messages[code];
}

function isUniqueConflict(error: unknown) {
  return error instanceof Error && /unique|constraint/i.test(error.message);
}
