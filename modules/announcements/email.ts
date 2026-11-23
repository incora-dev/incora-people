import { announcementTitleText, plainAnnouncementText } from "./content.ts";
import { formatIncoraEmailSender } from "../notifications/email-sender.ts";
import {
  EMAIL_PALETTE as palette,
  EMAIL_THEME_HEAD,
} from "../notifications/email-theme.ts";
import { EMAIL_PREVIEW_RECIPIENT } from "./preview-policy.ts";

export type AnnouncementRecipient = {
  email: string;
  locale: string;
};

export type AnnouncementEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};

export type AnnouncementEmailResult =
  | { kind: "accepted" }
  | { kind: "rejected"; failureCode: string }
  | { kind: "uncertain"; failureCode: string };

const BATCH_SIZE = 100;
const BRAND_MARK =
  "https://incora-people.incora-people.workers.dev/assets/incora-google-chat-avatar.png";

export function buildAnnouncementEmailPayload(input: {
  from: string;
  recipient: AnnouncementRecipient;
  title: string;
  body: string;
  announcementUrl: string;
}): AnnouncementEmailPayload {
  const english = input.recipient.locale === "en";
  const title = announcementTitleText(input.title);
  const bodyText = plainAnnouncementText(input.body);
  const characters = Array.from(bodyText);
  const preview =
    characters.length > 420
      ? `${characters.slice(0, 419).join("").trimEnd()}…`
      : bodyText;
  const url = new URL(input.announcementUrl);
  const heading = english ? "New announcement" : "Нове оголошення";
  const cta = english ? "View announcement" : "Переглянути оголошення";
  const footer = english
    ? "Automated notification from INCORA People"
    : "Автоматичне повідомлення від INCORA People";
  const safeTitle = escapeHtml(title);
  const safeUrl = escapeHtml(url.toString());
  const text = [
    "INCORA People",
    heading,
    title,
    "",
    preview,
    "",
    `${cta}: ${url.toString()}`,
    "",
    footer,
  ].join("\n");
  const html = `<!doctype html>
<html lang="${english ? "en" : "uk"}"><head>${EMAIL_THEME_HEAD}</head>
<body class="incora-email-bg incora-email-ink" style="margin:0;padding:0;background-color:${palette.background};color:${palette.ink};font-family:Arial,Helvetica,sans-serif">
<table class="incora-email-bg" role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${palette.background}"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="620" align="center" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
<table class="incora-email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${palette.card}" style="max-width:620px;background-color:${palette.card};border:1px solid ${palette.border};border-radius:12px">
<tr><td style="padding:28px">
  <table role="presentation" cellspacing="0" cellpadding="0"><tr>
    <td valign="middle"><img class="incora-email-logo" src="${BRAND_MARK}" width="32" height="32" alt="" style="display:block;border:0;border-radius:4px;background-color:${palette.card}"></td>
    <td class="incora-email-ink" valign="middle" style="padding-left:10px;color:${palette.ink};font-size:13px;font-weight:bold;letter-spacing:1px">INCORA PEOPLE</td>
  </tr></table>
  <p class="incora-email-secondary" style="margin:24px 0 6px;color:${palette.secondary};font-size:13px;line-height:18px">${heading}</p>
  <h1 class="incora-email-ink" style="margin:0 0 14px;color:${palette.ink};font-size:24px;line-height:30px;overflow-wrap:anywhere">${safeTitle}</h1>
  ${preview ? `<p class="incora-email-ink" style="margin:0 0 22px;color:${palette.ink};font-size:15px;line-height:23px;overflow-wrap:anywhere">${escapeHtml(preview)}</p>` : ""}
  <table role="presentation" cellspacing="0" cellpadding="0"><tr>
    <td class="incora-email-cta" align="center" bgcolor="${palette.ctaBackground}" style="background-color:${palette.ctaBackground};border-radius:8px;mso-padding-alt:0 18px">
      <a class="incora-email-cta" href="${safeUrl}" style="display:inline-block;padding:0 18px;background-color:${palette.ctaBackground};border-radius:8px;color:${palette.ctaInk};font-size:14px;font-weight:bold;line-height:44px;text-decoration:none;mso-padding-alt:0">${cta}</a>
    </td>
  </tr></table>
  <p class="incora-email-secondary" style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${palette.border};color:${palette.secondary};font-size:13px;line-height:18px">${footer}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return {
    from: formatIncoraEmailSender(input.from),
    to: [input.recipient.email.trim().toLowerCase()],
    subject: title,
    html,
    text,
  };
}

export async function sendAnnouncementEmails(input: {
  announcementId: number;
  deliveryId: number;
  payloads: AnnouncementEmailPayload[];
  apiKey: string;
  fetcher?: typeof fetch;
}): Promise<AnnouncementEmailResult> {
  const result = await sendResendAnnouncementBatches({
    ...input,
    idempotencyKey: `announcement/${input.announcementId}/delivery/${input.deliveryId}`,
  });
  return result.kind === "accepted" ? { kind: "accepted" } : result;
}

export async function sendAnnouncementEmailPreview(input: {
  from: string;
  publicOrigin: string;
  requestId: string;
  apiKey: string;
  fetcher?: typeof fetch;
}) {
  const payload = buildAnnouncementEmailPayload({
    from: input.from,
    recipient: { email: EMAIL_PREVIEW_RECIPIENT, locale: "uk" },
    title: "Research & Development — INCORA People",
    body: escapeHtml(
      "Перевірка символів: R&D, <test>, український текст та emoji ✅",
    ),
    announcementUrl: new URL("/announcements", input.publicOrigin).toString(),
  });
  if (
    payload.to.length !== 1 ||
    payload.to[0] !== EMAIL_PREVIEW_RECIPIENT ||
    "cc" in payload ||
    "bcc" in payload
  ) {
    return {
      kind: "rejected",
      failureCode: "unsafe_preview_recipient",
    } as const;
  }
  payload.subject = `[TEST] ${payload.subject}`;
  return sendResendAnnouncementBatches({
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    payloads: [payload],
    idempotencyKey: `announcement-preview/${input.requestId}`,
  });
}

async function sendResendAnnouncementBatches(input: {
  idempotencyKey: string;
  payloads: AnnouncementEmailPayload[];
  apiKey: string;
  fetcher?: typeof fetch;
}): Promise<
  | { kind: "accepted"; messageId?: string }
  | Exclude<AnnouncementEmailResult, { kind: "accepted" }>
> {
  if (!input.apiKey) {
    return { kind: "rejected", failureCode: "resend_not_configured" };
  }
  if (!input.payloads.length) return { kind: "accepted" };

  const fetcher = input.fetcher ?? fetch;
  let acceptedBatches = 0;
  let messageId: string | undefined;
  for (let offset = 0; offset < input.payloads.length; offset += BATCH_SIZE) {
    const batchIndex = Math.floor(offset / BATCH_SIZE);
    const batch = input.payloads.slice(offset, offset + BATCH_SIZE);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetcher("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": `${input.idempotencyKey}/batch/${batchIndex}`,
        },
        body: JSON.stringify(batch),
        signal: controller.signal,
      });
      if (!response.ok) {
        const definitelyRejectedBeforeAnyAcceptance =
          acceptedBatches === 0 &&
          (response.status === 401 || response.status === 403);
        if (definitelyRejectedBeforeAnyAcceptance) {
          return {
            kind: "rejected",
            failureCode: "resend_authentication",
          };
        }
        // A later batch or an ambiguous response may follow already-accepted
        // mail. Do not fall back or retry it automatically; reconcile first.
        if (acceptedBatches > 0 || response.status !== 400) {
          return {
            kind: "uncertain",
            failureCode:
              acceptedBatches > 0
                ? "resend_partial_batch_uncertain"
                : response.status === 409
                  ? "resend_idempotency_conflict"
                  : response.status === 429
                    ? "resend_rate_limit"
                    : "resend_temporary_error",
          };
        }
        return {
          kind: "rejected",
          failureCode: `resend_rejected_${response.status}`,
        };
      }
      const result = (await response.json().catch(() => null)) as {
        data?: Array<{ id?: unknown }>;
      } | null;
      if (
        !Array.isArray(result?.data) ||
        result.data.length !== batch.length ||
        result.data.some((email) => typeof email?.id !== "string")
      ) {
        return { kind: "uncertain", failureCode: "resend_invalid_response" };
      }
      acceptedBatches += 1;
      if (
        input.payloads.length === 1 &&
        typeof result.data[0].id === "string"
      ) {
        messageId = result.data[0].id;
      }
    } catch {
      return { kind: "uncertain", failureCode: "resend_outcome_unknown" };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { kind: "accepted", messageId };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
