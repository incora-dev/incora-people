import { getD1 } from "@/db";
import { AuthenticationRequiredError, getCurrentUser } from "@/lib/auth";
import {
  canSendAnnouncementPreview,
  EMAIL_PREVIEW_AUDIT,
  hasEmptyAnnouncementPreviewBody,
  isSameOriginAnnouncementPreview,
  matchesEmailPreviewIntent,
  PREVIEW_RETRY_SECONDS,
  RESERVE_ANNOUNCEMENT_PREVIEW_SQL,
  safePreviewMessageId,
} from "@/modules/announcements/preview-policy";

type PreviewTransport = {
  send: (
    requestId: string,
  ) => Promise<
    | { kind: "accepted"; messageId?: string | null }
    | { kind: "uncertain" | "rejected" }
  >;
};

export async function handleAdminEmailPreview(
  request: Request,
  kind: keyof typeof EMAIL_PREVIEW_AUDIT,
  prepareTransport: () => PreviewTransport | null,
) {
  if (!isSameOriginAnnouncementPreview(request)) {
    return Response.json(
      {
        error:
          "The test email must be requested from the same application origin.",
      },
      { status: 403 },
    );
  }

  let actor;
  try {
    actor = await getCurrentUser();
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    return Response.json(
      { error: "Sign in to send a test email." },
      { status: 401 },
    );
  }
  if (!canSendAnnouncementPreview(actor)) {
    return Response.json(
      { error: "Only a Super Admin can send a test email." },
      { status: 403 },
    );
  }
  if (!matchesEmailPreviewIntent(request, kind)) {
    return Response.json(
      {
        error:
          "The preview type did not match. Refresh the page and try again.",
      },
      { status: 400 },
    );
  }
  if (!(await hasEmptyAnnouncementPreviewBody(request))) {
    return Response.json(
      { error: "The test email request must not contain any data." },
      { status: 400 },
    );
  }

  const transport = prepareTransport();
  if (!transport) {
    return Response.json(
      { error: "Email preview is not configured." },
      { status: 503 },
    );
  }

  const requestId = crypto.randomUUID();
  try {
    const reservation = await getD1()
      .prepare(RESERVE_ANNOUNCEMENT_PREVIEW_SQL)
      .bind(actor.email, ...EMAIL_PREVIEW_AUDIT[kind], requestId)
      .run();
    if (!reservation.success) throw new Error("Could not reserve preview");
    if (reservation.meta.changes !== 1) {
      return Response.json(
        { error: "Only one test email is allowed every 15 minutes." },
        {
          status: 429,
          headers: { "retry-after": String(PREVIEW_RETRY_SECONDS) },
        },
      );
    }
  } catch {
    return Response.json(
      { error: "Could not record the preview. No email was sent." },
      { status: 503 },
    );
  }

  const result = await transport.send(requestId);
  if (result.kind === "accepted") {
    return Response.json({
      ok: true,
      kind,
      messageId: safePreviewMessageId(result.messageId),
    });
  }
  return Response.json(
    {
      error:
        result.kind === "uncertain"
          ? "The email provider outcome is unknown. Check Resend before trying again."
          : "The email provider rejected the test email.",
    },
    { status: 502 },
  );
}
