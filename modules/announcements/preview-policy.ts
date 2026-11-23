export const PREVIEW_RETRY_SECONDS = 15 * 60;
export const EMAIL_PREVIEW_RECIPIENT = "danylo.karpa@incorainc.com";
export const EMAIL_PREVIEW_AUDIT = {
  announcement: [
    "announcement.email_preview_attempted",
    "announcement_email_preview",
  ],
  invitation: [
    "employee_invitation.email_preview_attempted",
    "employee_invitation_email_preview",
  ],
} as const;

// One global reservation is written atomically with its audit event. Even an
// uncertain provider response consumes the cooldown. No migration is needed.
export const RESERVE_ANNOUNCEMENT_PREVIEW_SQL = `
  INSERT INTO audit_events (actor_email, action, entity_type, entity_id)
  SELECT ?, ?, ?, ?
  WHERE NOT EXISTS (
    SELECT 1 FROM audit_events
    WHERE action IN ('announcement.email_preview_attempted', 'employee_invitation.email_preview_attempted')
      AND created_at > datetime('now', '-${PREVIEW_RETRY_SECONDS} seconds')
  )`;

export function isSameOriginAnnouncementPreview(request: Request) {
  return (
    request.method === "POST" &&
    request.headers.get("origin") === new URL(request.url).origin &&
    (!request.headers.has("sec-fetch-site") ||
      request.headers.get("sec-fetch-site") === "same-origin")
  );
}

export function matchesEmailPreviewIntent(
  request: Request,
  kind: keyof typeof EMAIL_PREVIEW_AUDIT,
) {
  return request.headers.get("x-incora-email-preview") === kind;
}

export async function hasEmptyAnnouncementPreviewBody(request: Request) {
  // Workers can expose an empty stream even for a zero-byte POST. Check the
  // stream rather than its presence, and stop at the first non-empty chunk.
  if (!request.body) return true;
  const reader = request.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return true;
      if (value.byteLength > 0) {
        void reader.cancel().catch(() => {});
        return false;
      }
    }
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}

export function canSendAnnouncementPreview(actor: {
  role: string;
  userId: number | null;
  isPreview?: boolean;
}) {
  return (
    actor.role === "super_admin" && actor.userId !== null && !actor.isPreview
  );
}

export function safePreviewMessageId(value: string | null | undefined) {
  return value && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined;
}
