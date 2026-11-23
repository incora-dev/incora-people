import {
  isEligiblePreviewActor,
  isEligiblePreviewTarget,
  type PreviewActor,
} from "./policy.ts";
import { safeReturnPath } from "./session.ts";

const PREVIEW_TTL_MS = 15 * 60 * 1000;

type TargetRow = {
  user_id: number;
  email: string;
  role: string;
  enabled: number;
  employee_id: number;
  employee_email: string;
  employee_status: string;
  employee_first_name: string;
  employee_last_name: string;
  protected_user_id: number | null;
  linked_account_count: number;
};

export async function createEmployeePreview(
  db: D1Database,
  input: { actor: PreviewActor; sessionId: string; employeeId: number },
) {
  if (!isEligiblePreviewActor(input.actor)) {
    await recordPreviewAttempt(db, {
      actorUserId: input.actor.userId,
      sessionId: input.sessionId,
      employeeId: input.employeeId,
    });
    throw new PreviewCommandError("Preview access is not permitted.", 403);
  }

  const actorAdmission = await db
    .prepare(
      `SELECT u.id
         FROM users u
         JOIN web_sessions ws ON ws.user_id = u.id
        WHERE u.id = ? AND u.role = 'super_admin' AND u.enabled = 1
          AND ws.id = ? AND ws.revoked_at IS NULL AND ws.expires_at > ?
        LIMIT 1`,
    )
    .bind(input.actor.userId, input.sessionId, new Date().toISOString())
    .first<{ id: number }>();
  if (!actorAdmission) {
    await recordPreviewAttempt(db, {
      actorUserId: input.actor.userId,
      sessionId: input.sessionId,
      employeeId: input.employeeId,
    });
    throw new PreviewCommandError(
      "Preview access requires an active Super Admin web session.",
      403,
    );
  }

  const existing = await db
    .prepare(
      `SELECT id FROM employee_view_previews
        WHERE actor_web_session_id = ? AND status IN ('active', 'expired')
        ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(input.sessionId)
    .first<{ id: string }>();
  if (existing) {
    throw new PreviewCommandError(
      "Exit the current or expired preview before starting another.",
      409,
    );
  }

  const target = await db
    .prepare(
      `SELECT u.id AS user_id, u.email, u.role, u.enabled,
              u.employee_id, e.email AS employee_email, e.status AS employee_status,
              e.first_name AS employee_first_name, e.last_name AS employee_last_name,
              protected.user_id AS protected_user_id,
              COUNT(*) OVER () AS linked_account_count
         FROM employees e
         JOIN users u ON u.employee_id = e.id
         LEFT JOIN protected_admin_accounts protected ON protected.user_id = u.id
        WHERE e.id = ?
        LIMIT 1`,
    )
    .bind(input.employeeId)
    .first<TargetRow>();

  const eligible =
    target &&
    target.linked_account_count === 1 &&
    target.employee_id === input.employeeId &&
    isEligiblePreviewTarget({
      userId: target.user_id,
      employeeId: target.employee_id,
      email: target.email,
      employeeEmail: target.employee_email,
      role: target.role,
      enabled: target.enabled === 1,
      protectedAdmin: target.protected_user_id !== null,
      employeeStatus: target.employee_status,
    });
  if (!eligible || !target) {
    await recordPreviewAttempt(db, {
      actorUserId: input.actor.userId,
      sessionId: input.sessionId,
      employeeId: input.employeeId,
      targetUserId: target?.user_id ?? null,
    });
    throw new PreviewCommandError(
      "This employee account is not eligible for preview.",
      404,
    );
  }

  const previewId = crypto.randomUUID();
  const startedAt = new Date();
  const timestamp = startedAt.toISOString();
  const expiresAt = new Date(
    startedAt.getTime() + PREVIEW_TTL_MS,
  ).toISOString();
  const returnPath = safeReturnPath(
    `/employees/${input.employeeId}`,
    input.employeeId,
  );
  const sessionReferenceHash = await hashSessionReference(input.sessionId);
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO employee_view_previews
            (id, actor_user_id, actor_web_session_id, target_user_id,
             target_employee_id, status, started_at, expires_at, return_path)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .bind(
          previewId,
          input.actor.userId,
          input.sessionId,
          target.user_id,
          input.employeeId,
          timestamp,
          expiresAt,
          returnPath,
        ),
      db
        .prepare(
          `INSERT INTO employee_view_preview_audit
            (event_key, event_type, preview_id, actor_user_id, target_user_id,
             target_employee_id, session_reference_hash, created_at)
           VALUES (?, 'preview_started', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `preview_started:${previewId}`,
          previewId,
          input.actor.userId,
          target.user_id,
          input.employeeId,
          sessionReferenceHash,
          timestamp,
        ),
    ]);
  } catch {
    throw new PreviewCommandError(
      "A preview is already active for this administrator session.",
      409,
    );
  }

  return {
    previewId,
    expiresAt,
    returnPath,
    targetName:
      `${target.employee_first_name} ${target.employee_last_name}`.trim(),
  };
}

export async function endEmployeePreview(
  db: D1Database,
  input: { actorUserId: number; sessionId: string },
) {
  const preview = await db
    .prepare(
      `SELECT id, target_user_id, target_employee_id, return_path
         FROM employee_view_previews
        WHERE actor_user_id = ? AND actor_web_session_id = ?
          AND status IN ('active', 'expired')
        ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(input.actorUserId, input.sessionId)
    .first<{
      id: string;
      target_user_id: number;
      target_employee_id: number;
      return_path: string;
    }>();
  if (!preview) {
    throw new PreviewCommandError("No active preview was found.", 404);
  }
  const timestamp = new Date().toISOString();
  const sessionReferenceHash = await hashSessionReference(input.sessionId);
  const results = await db.batch([
    db
      .prepare(
        `UPDATE employee_view_previews
            SET status = 'ended', ended_at = ?
          WHERE id = ? AND status IN ('active', 'expired')`,
      )
      .bind(timestamp, preview.id),
    db
      .prepare(
        `INSERT INTO employee_view_preview_audit
          (event_key, event_type, preview_id, actor_user_id, target_user_id,
           target_employee_id, session_reference_hash, created_at)
         SELECT ?, 'preview_ended', id, actor_user_id, target_user_id,
                target_employee_id, ?, ?
           FROM employee_view_previews
          WHERE id = ? AND status = 'ended' AND ended_at = ?
         ON CONFLICT(event_key) DO NOTHING`,
      )
      .bind(
        `preview_ended:${preview.id}`,
        sessionReferenceHash,
        timestamp,
        preview.id,
        timestamp,
      ),
  ]);
  if (results[0]?.meta.changes !== 1) {
    throw new PreviewCommandError("Preview has already ended.", 409);
  }
  return {
    returnPath: safeReturnPath(preview.return_path, preview.target_employee_id),
  };
}

async function recordPreviewAttempt(
  db: D1Database,
  input: {
    actorUserId: number | null;
    sessionId: string;
    employeeId: number;
    targetUserId?: number | null;
  },
) {
  if (!input.actorUserId) return;
  const eventKey = `unauthorized_preview_attempt:${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT INTO employee_view_preview_audit
        (event_key, event_type, actor_user_id, target_user_id,
         target_employee_id, session_reference_hash, created_at)
       VALUES (?, 'unauthorized_preview_attempt', ?, ?, ?, ?, ?)`,
    )
    .bind(
      eventKey,
      input.actorUserId,
      input.targetUserId ?? null,
      input.employeeId,
      await hashSessionReference(input.sessionId),
      new Date().toISOString(),
    )
    .run();
}

async function hashSessionReference(sessionId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sessionId),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export class PreviewCommandError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PreviewCommandError";
    this.status = status;
  }
}
