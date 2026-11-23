import { enqueuePushNotifications } from "@/modules/notifications/outbox";

type PushMessage = {
  title: string;
  body: string;
  href?: string;
};

export async function sendMobilePush(
  userEmails: string[],
  message: PushMessage,
  dedupeKey?: string,
) {
  const normalized = [
    ...new Set(userEmails.map((email) => email.trim().toLowerCase())),
  ].filter(Boolean);
  if (!normalized.length) return;
  // Existing call sites do not need to know the transport. This stable key
  // keeps duplicate retries from creating duplicate push intents while the
  // outbox worker performs the actual network delivery.
  const eventKey =
    dedupeKey?.trim() ||
    [message.href ?? "/", message.title, message.body].join("|");
  await enqueuePushNotifications(normalized, message, `event:${eventKey}`);
}
