import { EMAIL_PREVIEW_RECIPIENT } from "../announcements/preview-policy.ts";
import { buildEmployeeInvitationPayload } from "./domain.ts";
import {
  sendInvitationEmail,
  type InvitationProviderResult,
} from "./provider.ts";

export function sendEmployeeInvitationPreview(input: {
  from: string;
  publicOrigin: string;
  apiKey: string;
  locale: string;
  requestId: string;
  fetcher?: typeof fetch;
}): Promise<InvitationProviderResult> {
  const payload = buildEmployeeInvitationPayload({
    from: input.from,
    firstName: input.locale === "en" ? "Danylo" : "Данило",
    email: EMAIL_PREVIEW_RECIPIENT,
    locale: input.locale,
    publicOrigin: input.publicOrigin,
    preview: true,
  });
  if (
    payload.to.length !== 1 ||
    payload.to[0] !== EMAIL_PREVIEW_RECIPIENT ||
    "cc" in payload ||
    "bcc" in payload
  ) {
    return Promise.resolve({
      kind: "rejected",
      failureCode: "unsafe_preview_recipient",
    });
  }
  return sendInvitationEmail(
    { attemptId: `invitation-preview/${input.requestId}`, payload },
    { apiKey: input.apiKey, enabled: true },
    input.fetcher,
  );
}
