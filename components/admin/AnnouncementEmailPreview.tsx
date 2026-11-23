"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";

const previewActions = {
  announcement: {
    kind: "announcement",
    path: "/api/admin/home/announcement-email-preview",
    accepted:
      "Resend accepted the announcement preview. Inbox delivery is not yet verified.",
  },
  invitation: {
    kind: "invitation",
    path: "/api/admin/home/invitation-email-preview",
    accepted:
      "Resend accepted the invitation preview. Inbox delivery is not yet verified.",
  },
} as const;

type PreviewAction = (typeof previewActions)[keyof typeof previewActions];

export function AnnouncementEmailPreview() {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"announcement" | "invitation" | null>(null);
  const [feedback, setFeedback] = useState<{
    error?: string;
    messageId?: string;
    accepted?: PreviewAction["accepted"];
  } | null>(null);

  async function sendPreview(action: PreviewAction) {
    if (busy) return;
    setBusy(action.kind);
    setFeedback(null);
    try {
      const response = await fetch(action.path, {
        method: "POST",
        headers: { "x-incora-email-preview": action.kind },
        credentials: "same-origin",
      });
      if (response.status === 401) {
        setFeedback({ error: "Sign in to send a test email." });
        return;
      }
      const result = (await response.json()) as {
        ok?: boolean;
        kind?: string;
        messageId?: string;
        error?: string;
      };
      setFeedback(
        response.ok && result.ok === true && result.kind === action.kind
          ? { accepted: action.accepted, messageId: result.messageId }
          : {
              error:
                result.error ?? "Could not confirm the test email outcome.",
            },
      );
    } catch {
      setFeedback({ error: "Could not confirm the test email outcome." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="panel admin-help">
      <Mail size={19} aria-hidden="true" />
      <div>
        <strong>{t("Email previews")}</strong>
        <p>
          {t(
            "Both test emails go only to danylo.karpa@incorainc.com. No announcement is published and no account access is granted.",
          )}
        </p>
        {feedback?.error ? (
          <p role="alert" className="form-error">
            {t(feedback.error)}
          </p>
        ) : feedback?.accepted ? (
          <p role="status">
            {t(feedback.accepted)}
            {feedback.messageId && (
              <>
                {" "}
                {t("Resend message ID:")} <code>{feedback.messageId}</code>
              </>
            )}
          </p>
        ) : null}
      </div>
      <div className="admin-help-actions" style={{ flexWrap: "wrap" }}>
        <button
          type="button"
          className="button ghost-button"
          disabled={busy !== null}
          onClick={() => sendPreview(previewActions.announcement)}
        >
          {busy === "announcement"
            ? t("Sending announcement preview…")
            : t("Send test announcement")}
        </button>
        <button
          type="button"
          className="button ghost-button"
          disabled={busy !== null}
          onClick={() => sendPreview(previewActions.invitation)}
        >
          {busy === "invitation"
            ? t("Sending test invitation…")
            : t("Send test invitation")}
        </button>
      </div>
    </article>
  );
}
