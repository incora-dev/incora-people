"use client";

import { FormEvent, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";

export type AnnouncementEngagementDto = {
  comments: {
    id: number;
    body: string;
    userEmail: string;
    authorName: string;
    createdAt: string;
  }[];
  reactions: {
    emoji: string;
    count: number;
    selected: boolean;
  }[];
};

export function AnnouncementEngagement({
  announcementId,
  initialEngagement,
  readOnlyPreview = false,
}: {
  announcementId: number;
  initialEngagement: AnnouncementEngagementDto;
  readOnlyPreview?: boolean;
}) {
  const { locale, t } = useI18n();
  const [engagement, setEngagement] = useState(initialEngagement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function update(payload: Record<string, string>) {
    if (readOnlyPreview) return false;
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/announcements/${announcementId}/engagement`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const result = (await response.json()) as
      AnnouncementEngagementDto | { error?: string };
    setBusy(false);
    if (!response.ok || !("comments" in result)) {
      setError(
        ("error" in result && result.error) ||
          t("Could not save your response."),
      );
      return false;
    }
    setEngagement(result);
    return true;
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    if (await update({ action: "comment", body })) form.reset();
  }

  return (
    <section
      className="announcement-engagement"
      aria-labelledby="comments-title"
    >
      <div className="announcement-reactions" aria-label={t("Reactions")}>
        {engagement.reactions.map((reaction) =>
          readOnlyPreview ? (
            <span
              className={reaction.selected ? "selected" : ""}
              aria-label={`${reaction.emoji} · ${reaction.count}`}
              key={reaction.emoji}
            >
              <span aria-hidden="true">{reaction.emoji}</span>
              {reaction.count > 0 && <b>{reaction.count}</b>}
            </span>
          ) : (
            <button
              type="button"
              className={reaction.selected ? "selected" : ""}
              aria-pressed={reaction.selected}
              aria-label={`${reaction.emoji} · ${reaction.count}`}
              disabled={busy}
              onClick={() =>
                void update({ action: "reaction", emoji: reaction.emoji })
              }
              key={reaction.emoji}
            >
              <span aria-hidden="true">{reaction.emoji}</span>
              {reaction.count > 0 && <b>{reaction.count}</b>}
            </button>
          ),
        )}
      </div>

      <div className="announcement-comments-heading">
        <MessageCircle size={19} />
        <h2 id="comments-title">{t("Comments")}</h2>
        <span>{engagement.comments.length}</span>
      </div>
      <div className="announcement-comment-list">
        {engagement.comments.map((comment) => (
          <article key={comment.id}>
            <span className="avatar compact-avatar">
              {initials(comment.authorName)}
            </span>
            <div>
              <header>
                <strong>{comment.authorName}</strong>
                <time dateTime={comment.createdAt}>
                  {formatDate(comment.createdAt, locale)}
                </time>
              </header>
              <p>{comment.body}</p>
            </div>
          </article>
        ))}
        {engagement.comments.length === 0 && (
          <p className="compact-empty">
            {t("No comments yet. Be the first to respond.")}
          </p>
        )}
      </div>

      {!readOnlyPreview && (
        <form className="announcement-comment-form" onSubmit={submitComment}>
          <label htmlFor="announcement-comment">{t("Add a comment")}</label>
          <div>
            <textarea
              id="announcement-comment"
              name="body"
              rows={3}
              maxLength={2000}
              placeholder={t("Write a comment…")}
              required
            />
            <button className="button primary-button" disabled={busy}>
              <Send size={16} /> {busy ? t("Sending…") : t("Post comment")}
            </button>
          </div>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Kyiv",
  }).format(new Date(value));
}
