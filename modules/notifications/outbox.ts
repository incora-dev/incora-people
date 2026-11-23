import { getD1 } from "@/db";

export type PushNotification = {
  title: string;
  body: string;
  href?: string;
};

/**
 * Build push outbox statements for a larger D1 batch. Keeping this as a
 * pure statement builder lets business commands commit their row, audit
 * event, in-app notification and push intent atomically.
 */
export function buildPushNotificationStatements(
  d1: D1Database,
  userEmails: string[],
  message: PushNotification,
  dedupeKey: string,
) {
  const recipients = [
    ...new Set(userEmails.map((email) => email.trim().toLowerCase())),
  ].filter(Boolean);
  const normalizedKey = dedupeKey.trim().slice(0, 180);
  if (!normalizedKey) throw new Error("A notification dedupe key is required.");
  const now = new Date().toISOString();
  return recipients.map((userEmail) =>
    d1
      .prepare(
        `INSERT INTO notification_outbox
           (id, channel, user_email, title, message, href, dedupe_key, status, attempts, available_at, last_error, sent_at, created_at)
         VALUES (?, 'push', ?, ?, ?, ?, ?, 'pending', 0, ?, '', NULL, ?)
         ON CONFLICT(dedupe_key) DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        userEmail,
        message.title,
        message.body,
        message.href ?? "/",
        `${normalizedKey}:${userEmail}`,
        now,
        now,
      ),
  );
}

/** Build synchronous in-app notification statements for an atomic command. */
export function buildInAppNotificationStatements(
  d1: D1Database,
  userEmails: string[],
  message: PushNotification,
) {
  const recipients = [
    ...new Set(userEmails.map((email) => email.trim().toLowerCase())),
  ].filter(Boolean);
  return recipients.map((userEmail) =>
    d1
      .prepare(
        "INSERT INTO notifications(user_email, title, message, href) VALUES (?, ?, ?, ?)",
      )
      .bind(userEmail, message.title, message.body, message.href ?? "/"),
  );
}

/**
 * Queue one logical push event for every recipient. The deterministic key is
 * unique per event/recipient, so retries and duplicate HTTP submissions cannot
 * create duplicate pushes. The Worker delivers the rows asynchronously.
 */
export async function enqueuePushNotifications(
  userEmails: string[],
  message: PushNotification,
  dedupeKey: string,
) {
  const statements = buildPushNotificationStatements(
    getD1(),
    userEmails,
    message,
    dedupeKey,
  );
  if (!statements.length) return;
  const d1 = getD1();
  await d1.batch(statements);
}
