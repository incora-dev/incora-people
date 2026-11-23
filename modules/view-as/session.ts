import { isEligiblePreviewTarget, normalizeIdentity } from "./policy.ts";

export type PreviewSessionContext = {
  state: "active" | "expired";
  previewId: string;
  actorUserId: number;
  targetUserId: number;
  targetEmployeeId: number;
  targetEmail: string;
  targetRole: string;
  targetName: string;
  expiresAt: string;
  returnPath: string;
};

type PreviewRow = {
  preview_id: string;
  preview_status: "active" | "ended" | "expired";
  actor_user_id: number;
  actor_role: string;
  actor_enabled: number;
  session_revoked_at: string | null;
  session_expires_at: string;
  target_user_id: number;
  target_employee_id: number | null;
  linked_employee_id: number | null;
  target_email: string | null;
  target_role: string | null;
  target_enabled: number | null;
  linked_account_count: number | null;
  target_protected_id: number | null;
  employee_id: number | null;
  employee_email: string | null;
  employee_status: string | null;
  first_name: string | null;
  last_name: string | null;
  expires_at: string;
  return_path: string;
};

export async function resolvePreviewSession(
  db: D1Database,
  actorUserId: number,
  sessionId: string,
  now = new Date(),
): Promise<PreviewSessionContext | null> {
  const row = await db
    .prepare(
      `SELECT p.id AS preview_id, p.status AS preview_status,
              p.actor_user_id, actor.role AS actor_role,
              actor.enabled AS actor_enabled,
              ws.revoked_at AS session_revoked_at,
              ws.expires_at AS session_expires_at,
              p.target_user_id, p.target_employee_id,
              target.employee_id AS linked_employee_id,
              target.email AS target_email, target.role AS target_role,
              target.enabled AS target_enabled,
              (SELECT COUNT(*) FROM users linked
                WHERE linked.employee_id = target.employee_id) AS linked_account_count,
              protected.user_id AS target_protected_id,
              employee.id AS employee_id, employee.email AS employee_email,
              employee.status AS employee_status,
              employee.first_name, employee.last_name,
              p.expires_at, p.return_path
         FROM employee_view_previews p
         JOIN users actor ON actor.id = p.actor_user_id
         JOIN web_sessions ws ON ws.id = p.actor_web_session_id
         LEFT JOIN users target ON target.id = p.target_user_id
         LEFT JOIN employees employee ON employee.id = p.target_employee_id
         LEFT JOIN protected_admin_accounts protected
                ON protected.user_id = target.id
        WHERE p.actor_user_id = ?
          AND p.actor_web_session_id = ?
          AND p.status IN ('active', 'expired')
        ORDER BY p.started_at DESC, p.id DESC
        LIMIT 1`,
    )
    .bind(actorUserId, sessionId)
    .first<PreviewRow>();
  if (!row) return null;

  const returnPath = safeReturnPath(row.return_path, row.target_employee_id);
  if (row.preview_status === "expired") {
    return contextFromRow(row, "expired", returnPath);
  }

  const targetEligible =
    row.target_email !== null &&
    row.target_role !== null &&
    row.target_enabled !== null &&
    row.linked_account_count === 1 &&
    row.employee_id !== null &&
    row.employee_email !== null &&
    row.employee_status !== null &&
    isEligiblePreviewTarget({
      userId: row.target_user_id,
      employeeId: row.employee_id,
      email: row.target_email,
      employeeEmail: row.employee_email,
      role: row.target_role,
      enabled: row.target_enabled === 1,
      protectedAdmin: row.target_protected_id !== null,
      employeeStatus: row.employee_status,
    });
  const active =
    row.actor_role === "super_admin" &&
    row.actor_enabled === 1 &&
    row.session_revoked_at === null &&
    Date.parse(row.session_expires_at) > now.getTime() &&
    Date.parse(row.expires_at) > now.getTime() &&
    row.target_employee_id !== null &&
    row.target_employee_id === row.linked_employee_id &&
    row.target_employee_id === row.employee_id &&
    targetEligible;

  if (!active) {
    await expirePreview(db, row, sessionId, now.toISOString());
    return contextFromRow(row, "expired", returnPath);
  }
  return contextFromRow(row, "active", returnPath);
}

export function safeReturnPath(returnPath: string, employeeId: number | null) {
  if (/^\/employees\/\d+$/.test(returnPath)) return returnPath;
  return employeeId && employeeId > 0
    ? `/employees/${employeeId}`
    : "/employees";
}

async function expirePreview(
  db: D1Database,
  row: PreviewRow,
  sessionId: string,
  timestamp: string,
) {
  const sessionReferenceHash = await hashSessionReference(sessionId);
  await db.batch([
    db
      .prepare(
        `UPDATE employee_view_previews
            SET status = 'expired', ended_at = ?
          WHERE id = ? AND status = 'active'`,
      )
      .bind(timestamp, row.preview_id),
    db
      .prepare(
        `INSERT INTO employee_view_preview_audit
          (event_key, event_type, preview_id, actor_user_id, target_user_id,
           target_employee_id, session_reference_hash, created_at)
         SELECT ?, 'preview_expired', id, actor_user_id, target_user_id,
                target_employee_id, ?, ?
           FROM employee_view_previews
          WHERE id = ? AND status = 'expired' AND ended_at = ?
         ON CONFLICT(event_key) DO NOTHING`,
      )
      .bind(
        `preview_expired:${row.preview_id}`,
        sessionReferenceHash,
        timestamp,
        row.preview_id,
        timestamp,
      ),
  ]);
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

function contextFromRow(
  row: PreviewRow,
  state: "active" | "expired",
  returnPath: string,
): PreviewSessionContext {
  return {
    state,
    previewId: row.preview_id,
    actorUserId: row.actor_user_id,
    targetUserId: row.target_user_id,
    targetEmployeeId: row.target_employee_id ?? 0,
    targetEmail: normalizeIdentity(row.target_email ?? ""),
    targetRole: row.target_role ?? "",
    targetName: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
    expiresAt: row.expires_at,
    returnPath,
  };
}
