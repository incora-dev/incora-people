import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  announcementDeliveries,
  announcements,
  employees,
  users,
} from "@/db/schema";
import { getAnnouncementDeliveryConfig } from "@/lib/runtime-config";
import { parseInvitationPublicOrigin } from "@/modules/invitations/domain";
import {
  buildAnnouncementEmailPayload,
  sendAnnouncementEmails,
} from "@/modules/announcements/email";
import {
  CLAIM_ANNOUNCEMENT_DELIVERY_SQL,
  ENQUEUE_ANNOUNCEMENT_DELIVERY_SQL,
} from "@/modules/announcements/delivery-domain";
import {
  announcementChatText,
  announcementTitleText,
  plainAnnouncementText,
} from "@/modules/announcements/content";
import { postAnnouncementWebhook } from "@/modules/announcements/webhook";

export async function enqueueAnnouncementDelivery(
  announcementId: number,
  scheduledFor: string,
) {
  const d1 = getD1();
  await d1.batch(
    ["google_chat", "email"].map((channel) =>
      d1
        .prepare(ENQUEUE_ANNOUNCEMENT_DELIVERY_SQL)
        .bind(announcementId, channel, scheduledFor),
    ),
  );
}

export async function processAnnouncementDeliveries(
  origin: string,
  onlyAnnouncementId?: number,
) {
  const db = getDb();
  const now = new Date().toISOString();
  const due = await db
    .select({ delivery: announcementDeliveries, announcement: announcements })
    .from(announcementDeliveries)
    .innerJoin(
      announcements,
      eq(announcementDeliveries.announcementId, announcements.id),
    )
    .where(
      and(
        eq(announcementDeliveries.status, "pending"),
        eq(announcementDeliveries.attempts, 0),
        lte(announcementDeliveries.scheduledFor, now),
        eq(announcements.active, true),
        or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
        onlyAnnouncementId
          ? eq(announcementDeliveries.announcementId, onlyAnnouncementId)
          : undefined,
      ),
    )
    .orderBy(asc(announcementDeliveries.scheduledFor))
    .limit(50);
  const config = getAnnouncementDeliveryConfig();
  const recipients = await db
    .select({ email: users.email, locale: users.locale })
    .from(users)
    .innerJoin(employees, eq(users.employeeId, employees.id))
    .where(
      and(
        eq(employees.status, "active"),
        eq(users.enabled, true),
        sql`lower(trim(${users.email})) = lower(trim(${employees.email}))`,
      ),
    )
    .orderBy(asc(users.email));
  const publicOrigin =
    config.publicOrigin ??
    (config.appMode === "demo"
      ? parseInvitationPublicOrigin(origin, config.appMode)
      : null);
  let processed = 0;

  for (const item of due) {
    const attemptNumber = await claimDelivery(
      item.delivery.id,
      item.delivery.attempts,
    );
    if (attemptNumber === null) continue;
    processed += 1;

    const directResendConfigured =
      Boolean(config.resendApiKey) && Boolean(config.resendFrom);
    const legacyEmailConfigured =
      Boolean(config.emailWebhookUrl) && Boolean(config.webhookSecret);
    const endpoint =
      item.delivery.channel === "google_chat"
        ? config.googleChatWebhookUrl
        : directResendConfigured
          ? "resend"
          : legacyEmailConfigured
            ? config.emailWebhookUrl
            : "";
    if (!endpoint) {
      await mark(
        item.delivery.id,
        attemptNumber,
        "skipped",
        item.delivery.channel === "email"
          ? "Resend or the legacy email webhook is not configured."
          : "Google Chat webhook is not configured.",
      );
      continue;
    }
    if (item.delivery.channel === "email" && !recipients.length) {
      await mark(
        item.delivery.id,
        attemptNumber,
        "skipped",
        "No eligible active employee recipients were found.",
      );
      continue;
    }
    if (!publicOrigin) {
      await mark(
        item.delivery.id,
        attemptNumber,
        "skipped",
        "A valid canonical application URL is not configured.",
      );
      continue;
    }

    const announcementUrl = new URL(
      `/announcements/${item.announcement.id}`,
      publicOrigin,
    ).toString();
    try {
      if (item.delivery.channel === "email" && endpoint === "resend") {
        const payloads = recipients.map((recipient) =>
          buildAnnouncementEmailPayload({
            from: config.resendFrom,
            recipient,
            title: item.announcement.title,
            body: item.announcement.body,
            announcementUrl,
          }),
        );
        const result = await sendAnnouncementEmails({
          announcementId: item.announcement.id,
          deliveryId: item.delivery.id,
          payloads,
          apiKey: config.resendApiKey,
        });
        if (result.kind === "rejected") {
          await mark(
            item.delivery.id,
            attemptNumber,
            "failed",
            result.failureCode,
          );
          continue;
        }
        if (result.kind === "uncertain") {
          await mark(
            item.delivery.id,
            attemptNumber,
            "uncertain",
            result.failureCode,
          );
          continue;
        }
      } else {
        const payload =
          item.delivery.channel === "google_chat"
            ? {
                text: announcementChatText(
                  item.announcement.title,
                  item.announcement.body,
                  announcementUrl,
                ),
              }
            : {
                recipients: recipients.map((recipient) => recipient.email),
                subject: announcementTitleText(item.announcement.title),
                text: plainAnnouncementText(item.announcement.body),
                url: announcementUrl,
                secret: config.webhookSecret,
              };
        const response = await postAnnouncementWebhook(endpoint, payload, {
          secret:
            item.delivery.channel === "email" || config.webhookSecret
              ? config.webhookSecret
              : undefined,
        });
        if (item.delivery.channel === "email") {
          await assertEmailWebhookAccepted(response);
        }
      }
      await mark(item.delivery.id, attemptNumber, "sent", "");
    } catch (error) {
      await mark(
        item.delivery.id,
        attemptNumber,
        "uncertain",
        error instanceof Error ? error.message : "Delivery failed.",
      );
    }
  }
  return processed;
}

export async function assertEmailWebhookAccepted(response: Response) {
  let result: unknown;
  try {
    result = JSON.parse(await response.text());
  } catch {
    throw new Error("Email webhook returned an invalid response.");
  }
  if (
    !result ||
    typeof result !== "object" ||
    !("ok" in result) ||
    result.ok !== true
  ) {
    throw new Error("Email webhook rejected delivery.");
  }
}

async function claimDelivery(id: number, previousAttempts: number) {
  const result = await getD1()
    .prepare(CLAIM_ANNOUNCEMENT_DELIVERY_SQL)
    .bind(id, previousAttempts)
    .run();
  return Number(result.meta.changes ?? 0) === 1 ? previousAttempts + 1 : null;
}

async function mark(
  id: number,
  attemptNumber: number,
  status: string,
  lastError: string,
) {
  await getD1()
    .prepare(
      "UPDATE announcement_deliveries SET status = ?, last_error = ?, sent_at = ? WHERE id = ? AND status = 'pending' AND attempts = ?",
    )
    .bind(
      status,
      lastError.slice(0, 500),
      status === "sent" ? new Date().toISOString() : null,
      id,
      attemptNumber,
    )
    .run();
}
