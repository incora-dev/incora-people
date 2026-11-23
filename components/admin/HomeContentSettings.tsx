"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  Link2,
  ImagePlus,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { PollBuilder } from "@/components/admin/PollBuilder";
import type {
  AnnouncementDto,
  CompanyEventDto,
  CompanyLinkDto,
} from "@/modules/admin/types";
import type { PollQuestion } from "@/modules/announcements/polls";

export function HomeContentSettings({
  events: initialEvents,
  announcements: initialAnnouncements,
  companyLinks: initialLinks,
  section,
  initialView,
  onMessage,
  onSaved,
}: {
  events: CompanyEventDto[];
  announcements: AnnouncementDto[];
  companyLinks: CompanyLinkDto[];
  section: "announcements" | "events" | "links";
  initialView: "create" | "edit";
  onMessage: (message: string) => void;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [links, setLinks] = useState(initialLinks);
  const [busy, setBusy] = useState(false);
  const [announcementDraftKey, setAnnouncementDraftKey] = useState(0);
  const [announcementScheduleMode, setAnnouncementScheduleMode] = useState<
    "now" | "scheduled"
  >("now");
  const [editingAnnouncement, setEditingAnnouncement] =
    useState<AnnouncementDto | null>(null);
  const [editingEvent, setEditingEvent] = useState<CompanyEventDto | null>(
    null,
  );
  const [editingLink, setEditingLink] = useState<CompanyLinkDto | null>(null);

  async function uploadAnnouncementImage(id: number, image: File) {
    const payload = new FormData();
    payload.set("image", image);
    const response = await fetch(`/api/admin/home/announcements/${id}/image`, {
      method: "POST",
      body: payload,
    });
    const result = (await response.json()) as {
      announcement?: AnnouncementDto;
      error?: string;
    };
    if (!response.ok || !result.announcement) {
      throw new Error(
        result.error ?? t("Could not upload announcement image."),
      );
    }
    return result.announcement;
  }

  async function uploadPollOptionImages(
    announcementId: number,
    uploads: PollOptionUpload[],
    rawQuestions: FormDataEntryValue | undefined,
  ) {
    if (uploads.length === 0) return null;
    const questions = parsePollQuestionsValue(rawQuestions);
    if (questions === null) throw new Error(t("Invalid questionnaire."));
    for (const upload of uploads) {
      const payload = new FormData();
      payload.set("image", upload.file);
      payload.set("questionId", upload.questionId);
      payload.set("optionId", upload.optionId);
      const response = await fetch(
        `/api/admin/home/announcements/${announcementId}/poll-option-image`,
        { method: "POST", body: payload },
      );
      const result = (await response.json()) as {
        imageUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.imageUrl) {
        throw new Error(
          result.error ?? t("Could not upload poll option image."),
        );
      }
      const question = questions.find((item) => item.id === upload.questionId);
      const option = question?.options.find(
        (item) => item.id === upload.optionId,
      );
      if (option) option.imageUrl = result.imageUrl;
    }
    const response = await fetch(
      `/api/admin/home/announcements/${announcementId}/poll`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pollQuestions: questions }),
      },
    );
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(result.error ?? t("Could not save questionnaire."));
    }
    return questions;
  }

  async function create(
    event: FormEvent<HTMLFormElement>,
    kind: "events" | "announcements" | "links",
  ) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const pollUploads = collectPollOptionUploads(formData);
    pollUploads.forEach((upload) => formData.delete(upload.fieldName));
    const image = formData.get("image");
    const hasAnnouncementImage =
      kind === "announcements" && image instanceof File && image.size > 0;
    if (!hasAnnouncementImage) formData.delete("image");
    const values = Object.fromEntries(formData.entries());
    const payload =
      kind === "announcements"
        ? {
            ...values,
            publishedAt:
              announcementScheduleMode === "now"
                ? new Date().toISOString()
                : values.publishedAt,
            pinned: values.pinned === "on",
          }
        : values;
    const requestBody = hasAnnouncementImage
      ? (() => {
          formData.set("publishedAt", String(payload.publishedAt));
          formData.set("pinned", payload.pinned ? "true" : "false");
          return formData;
        })()
      : JSON.stringify(payload);
    const response = await fetch(`/api/admin/home/${kind}`, {
      method: "POST",
      ...(hasAnnouncementImage
        ? {}
        : { headers: { "content-type": "application/json" } }),
      body: requestBody,
    });
    const result = (await response.json()) as {
      event?: CompanyEventDto;
      announcement?: AnnouncementDto;
      link?: CompanyLinkDto;
      error?: string;
    };
    if (response.ok) {
      let announcement = result.announcement;
      let imageError: string | null = null;
      if (
        announcement &&
        image instanceof File &&
        image.size > 0 &&
        !hasAnnouncementImage
      ) {
        try {
          announcement = await uploadAnnouncementImage(announcement.id, image);
        } catch (uploadError) {
          imageError =
            uploadError instanceof Error
              ? uploadError.message
              : t("Could not upload announcement image.");
        }
      }
      if (announcement && pollUploads.length > 0) {
        try {
          const questions = await uploadPollOptionImages(
            announcement.id,
            pollUploads,
            values.pollQuestions,
          );
          if (questions && announcement.poll) {
            announcement = {
              ...announcement,
              poll: { ...announcement.poll, questions },
            };
          }
        } catch (uploadError) {
          imageError =
            uploadError instanceof Error
              ? uploadError.message
              : t("Could not upload poll option image.");
        }
      }
      if (result.event) setEvents((items) => [...items, result.event!]);
      if (announcement) setAnnouncements((items) => [announcement!, ...items]);
      if (announcement) setAnnouncementDraftKey((value) => value + 1);
      if (announcement) setAnnouncementScheduleMode("now");
      if (result.link) setLinks((items) => [...items, result.link!]);
      form.reset();
      onMessage(imageError ?? t("Home content added."));
      router.refresh();
      onSaved?.();
    } else {
      onMessage(result.error ?? t("Could not save home content."));
    }
    setBusy(false);
  }

  async function remove(kind: string, id: number) {
    const response = await fetch(`/api/admin/home/${kind}/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      onMessage(t("Could not remove home content."));
      return;
    }
    if (kind === "events")
      setEvents((items) => items.filter((item) => item.id !== id));
    if (kind === "announcements")
      setAnnouncements((items) => items.filter((item) => item.id !== id));
    if (kind === "links")
      setLinks((items) => items.filter((item) => item.id !== id));
    onMessage(t("Home content removed."));
    router.refresh();
  }

  async function updateAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAnnouncement) return;
    setBusy(true);
    const formData = new FormData(event.currentTarget);
    const pollUploads = collectPollOptionUploads(formData);
    pollUploads.forEach((upload) => formData.delete(upload.fieldName));
    const image = formData.get("image");
    const removeImage = formData.get("removeImage") === "on";
    formData.delete("image");
    formData.delete("removeImage");
    const values = Object.fromEntries(formData.entries());
    const response = await fetch(
      `/api/admin/home/announcements/${editingAnnouncement.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          publishedAt:
            announcementScheduleMode === "now"
              ? new Date(editingAnnouncement.publishedAt).getTime() > Date.now()
                ? new Date().toISOString()
                : editingAnnouncement.publishedAt
              : values.publishedAt,
          pinned: values.pinned === "on",
        }),
      },
    );
    const result = (await response.json()) as {
      announcement?: AnnouncementDto;
      error?: string;
    };
    if (response.ok && result.announcement) {
      let announcement = result.announcement;
      let imageError: string | null = null;
      try {
        if (image instanceof File && image.size > 0) {
          announcement = await uploadAnnouncementImage(announcement.id, image);
        } else if (removeImage && announcement.imageFileId) {
          const imageResponse = await fetch(
            `/api/admin/home/announcements/${announcement.id}/image`,
            { method: "DELETE" },
          );
          if (!imageResponse.ok)
            throw new Error(t("Could not remove announcement image."));
          announcement = { ...announcement, imageFileId: null };
        }
        if (pollUploads.length > 0) {
          const questions = await uploadPollOptionImages(
            announcement.id,
            pollUploads,
            values.pollQuestions,
          );
          if (questions && announcement.poll) {
            announcement = {
              ...announcement,
              poll: { ...announcement.poll, questions },
            };
          }
        }
      } catch (uploadError) {
        imageError =
          uploadError instanceof Error
            ? uploadError.message
            : t("Could not upload announcement image.");
      }
      setAnnouncements((items) =>
        items.map((item) =>
          item.id === announcement.id ? announcement : item,
        ),
      );
      setEditingAnnouncement(null);
      onMessage(imageError ?? t("Announcement updated."));
      router.refresh();
      onSaved?.();
    } else {
      onMessage(result.error ?? t("Could not save home content."));
    }
    setBusy(false);
  }

  async function updateItem(
    event: FormEvent<HTMLFormElement>,
    kind: "events" | "links",
    id: number,
  ) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch(`/api/admin/home/${kind}/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        Object.fromEntries(new FormData(event.currentTarget).entries()),
      ),
    });
    const result = (await response.json()) as {
      event?: CompanyEventDto;
      link?: CompanyLinkDto;
      error?: string;
    };
    if (response.ok && result.event) {
      setEvents((items) =>
        items.map((item) => (item.id === id ? result.event! : item)),
      );
      setEditingEvent(null);
      onMessage(t("Event updated."));
      router.refresh();
      onSaved?.();
    } else if (response.ok && result.link) {
      setLinks((items) =>
        items.map((item) => (item.id === id ? result.link! : item)),
      );
      setEditingLink(null);
      onMessage(t("Company link updated."));
      router.refresh();
      onSaved?.();
    } else onMessage(result.error ?? t("Could not save home content."));
    setBusy(false);
  }

  async function retryAnnouncementDelivery(id: number) {
    setBusy(true);
    const response = await fetch(
      `/api/admin/home/announcements/${id}/deliveries`,
      { method: "POST" },
    );
    const result = (await response.json()) as {
      deliveries?: AnnouncementDto["deliveries"];
      error?: string;
    };
    if (response.ok && result.deliveries) {
      setAnnouncements((items) =>
        items.map((item) =>
          item.id === id ? { ...item, deliveries: result.deliveries } : item,
        ),
      );
      onMessage(t("Announcement delivery retried."));
    } else {
      onMessage(result.error ?? t("Could not retry announcement delivery."));
    }
    setBusy(false);
  }

  return (
    <div className="home-admin-grid single-section">
      {section === "events" && (
        <ContentPanel
          icon={<CalendarRange size={18} />}
          title={t("Planned events")}
          subtitle={t("Events visible to everyone on the home page.")}
        >
          {(initialView === "create" || editingEvent) && (
            <form
              onSubmit={(event) =>
                editingEvent
                  ? updateItem(event, "events", editingEvent.id)
                  : create(event, "events")
              }
            >
              <input
                name="title"
                defaultValue={editingEvent?.title ?? ""}
                placeholder={t("Event title")}
                required
              />
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={inputDateTime(editingEvent?.startsAt ?? null)}
                required
              />
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={inputDateTime(editingEvent?.endsAt ?? null)}
              />
              <input
                name="location"
                defaultValue={editingEvent?.location ?? ""}
                placeholder={t("Location")}
              />
              <input
                name="url"
                defaultValue={editingEvent?.url ?? ""}
                placeholder="https://"
                type="url"
              />
              <textarea
                name="description"
                defaultValue={editingEvent?.description ?? ""}
                placeholder={t("Description")}
              />
              <AddButton
                busy={busy}
                label={editingEvent ? t("Save changes") : t("Add event")}
              />
            </form>
          )}
          {initialView === "edit" && !editingEvent && (
            <ContentList
              items={events.map((item) => ({
                id: item.id,
                title: item.title,
                note: new Date(item.startsAt).toLocaleString(),
              }))}
              onEdit={(id) =>
                setEditingEvent(events.find((item) => item.id === id) ?? null)
              }
              onRemove={(id) => remove("events", id)}
            />
          )}
        </ContentPanel>
      )}

      {section === "announcements" && (
        <ContentPanel
          icon={<Megaphone size={18} />}
          title={t("Announcements")}
          subtitle={t("Short company updates for the home page.")}
        >
          {editingAnnouncement ? (
            <form onSubmit={updateAnnouncement}>
              <input
                name="title"
                defaultValue={editingAnnouncement.title}
                placeholder={t("Announcement title")}
                required
              />
              <RichTextEditor
                name="body"
                initialValue={editingAnnouncement.body}
              />
              <AnnouncementImageField
                imageFileId={editingAnnouncement.imageFileId}
                t={t}
              />
              <div className="home-admin-form-field">
                <span>{t("Publication")}</span>
                <PublicationMode
                  mode={announcementScheduleMode}
                  onChange={setAnnouncementScheduleMode}
                  t={t}
                />
              </div>
              {announcementScheduleMode === "scheduled" && (
                <label>
                  <span>{t("Publication date and time")}</span>
                  <input
                    name="publishedAt"
                    type="datetime-local"
                    defaultValue={inputDateTime(
                      editingAnnouncement.publishedAt,
                    )}
                    required
                  />
                </label>
              )}
              <label>
                <span>{t("Expire at")}</span>
                <input
                  name="expiresAt"
                  type="datetime-local"
                  defaultValue={inputDateTime(editingAnnouncement.expiresAt)}
                />
              </label>
              <label className="inline-check">
                <input
                  defaultChecked={editingAnnouncement.pinned}
                  name="pinned"
                  type="checkbox"
                />{" "}
                {t("Pin announcement")}
              </label>
              <PollBuilder
                initialQuestions={editingAnnouncement.poll?.questions ?? []}
              />
              <div className="inline-form-actions">
                <AddButton busy={busy} label={t("Save announcement")} />
                <button
                  className="button ghost-button"
                  type="button"
                  onClick={() => setEditingAnnouncement(null)}
                >
                  {t("Cancel")}
                </button>
              </div>
            </form>
          ) : initialView === "create" ? (
            <form
              key={announcementDraftKey}
              onSubmit={(event) => create(event, "announcements")}
            >
              <input
                name="title"
                placeholder={t("Announcement title")}
                required
              />
              <RichTextEditor name="body" />
              <AnnouncementImageField t={t} />
              <div className="home-admin-form-field">
                <span>{t("Publication")}</span>
                <PublicationMode
                  mode={announcementScheduleMode}
                  onChange={setAnnouncementScheduleMode}
                  t={t}
                />
              </div>
              {announcementScheduleMode === "scheduled" && (
                <label>
                  <span>{t("Publication date and time")}</span>
                  <input
                    name="publishedAt"
                    type="datetime-local"
                    defaultValue={localDateTime()}
                    min={localDateTime()}
                    required
                  />
                </label>
              )}
              <label>
                <span>{t("Expire at")}</span>
                <input name="expiresAt" type="datetime-local" />
              </label>
              <label className="inline-check">
                <input name="pinned" type="checkbox" /> {t("Pin announcement")}
              </label>
              <PollBuilder />
              <AddButton
                busy={busy}
                label={
                  announcementScheduleMode === "now"
                    ? t("Publish now")
                    : t("Schedule publication")
                }
              />
            </form>
          ) : null}
          {initialView === "edit" && !editingAnnouncement && (
            <ContentList
              items={announcements.map((item) => ({
                id: item.id,
                title: item.title,
                note: announcementStatus(item, t),
                meta: deliveryStatus(item, t),
                retryable: item.deliveries?.some(
                  (delivery) =>
                    delivery.status === "failed" ||
                    delivery.status === "skipped" ||
                    (delivery.status === "pending" && delivery.attempts === 0),
                ),
              }))}
              onEdit={(id) => {
                const item =
                  announcements.find(
                    (announcement) => announcement.id === id,
                  ) ?? null;
                setEditingAnnouncement(item);
                setAnnouncementScheduleMode(
                  item && new Date(item.publishedAt).getTime() > Date.now()
                    ? "scheduled"
                    : "now",
                );
              }}
              onRetry={retryAnnouncementDelivery}
              retryLabel={t("Retry delivery")}
              onRemove={(id) => remove("announcements", id)}
            />
          )}
        </ContentPanel>
      )}

      {section === "links" && (
        <ContentPanel
          icon={<Link2 size={18} />}
          title={t("Company links")}
          subtitle={t("Useful resources available to every employee.")}
        >
          {(initialView === "create" || editingLink) && (
            <form
              onSubmit={(event) =>
                editingLink
                  ? updateItem(event, "links", editingLink.id)
                  : create(event, "links")
              }
            >
              <input
                name="label"
                defaultValue={editingLink?.label ?? ""}
                placeholder={t("Link label")}
                required
              />
              <input
                name="url"
                defaultValue={editingLink?.url ?? ""}
                placeholder="https://"
                type="url"
                required
              />
              <input
                name="description"
                defaultValue={editingLink?.description ?? ""}
                placeholder={t("Short description")}
              />
              <input
                name="sortOrder"
                type="number"
                min="0"
                defaultValue={editingLink?.sortOrder ?? 0}
              />
              <AddButton
                busy={busy}
                label={editingLink ? t("Save changes") : t("Add link")}
              />
            </form>
          )}
          {initialView === "edit" && !editingLink && (
            <ContentList
              items={links.map((item) => ({
                id: item.id,
                title: item.label,
                note: item.url,
              }))}
              onEdit={(id) =>
                setEditingLink(links.find((item) => item.id === id) ?? null)
              }
              onRemove={(id) => remove("links", id)}
            />
          )}
        </ContentPanel>
      )}
    </div>
  );
}

type PollOptionUpload = {
  fieldName: string;
  questionId: string;
  optionId: string;
  file: File;
};

function collectPollOptionUploads(formData: FormData) {
  const uploads: PollOptionUpload[] = [];
  for (const [fieldName, value] of formData.entries()) {
    if (
      !fieldName.startsWith("pollOptionImage:") ||
      !(value instanceof File) ||
      value.size === 0
    ) {
      continue;
    }
    const [, questionId, optionId] = fieldName.split(":");
    if (questionId && optionId) {
      uploads.push({ fieldName, questionId, optionId, file: value });
    }
  }
  return uploads;
}

function parsePollQuestionsValue(
  value: FormDataEntryValue | undefined,
): PollQuestion[] | null {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as PollQuestion[]) : null;
  } catch {
    return null;
  }
}

function ContentPanel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel data-panel home-admin-panel">
      <div className="data-panel-heading">
        <div>
          <h2>
            {icon} {title}
          </h2>
          <span>{subtitle}</span>
        </div>
      </div>
      {children}
    </section>
  );
}

function AddButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button className="button primary-button" disabled={busy} type="submit">
      <Plus size={15} /> {label}
    </button>
  );
}

function PublicationMode({
  mode,
  onChange,
  t,
}: {
  mode: "now" | "scheduled";
  onChange: (mode: "now" | "scheduled") => void;
  t: (value: string) => string;
}) {
  return (
    <span className="publication-mode-switch" role="radiogroup">
      <button
        className={mode === "now" ? "active" : ""}
        type="button"
        role="radio"
        aria-checked={mode === "now"}
        onClick={() => onChange("now")}
      >
        {t("Publish now")}
      </button>
      <button
        className={mode === "scheduled" ? "active" : ""}
        type="button"
        role="radio"
        aria-checked={mode === "scheduled"}
        onClick={() => onChange("scheduled")}
      >
        {t("Scheduled publication")}
      </button>
    </span>
  );
}

function AnnouncementImageField({
  imageFileId,
  t,
}: {
  imageFileId?: string | null;
  t: (value: string) => string;
}) {
  const [selectedFileName, setSelectedFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="announcement-image-field">
      <span>
        <ImagePlus size={17} /> {t("Announcement image")}
      </span>
      {imageFileId && (
        <div className="announcement-image-current">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${imageFileId}?preview=1`}
            alt={t("Current announcement image")}
          />
          <label className="inline-check">
            <input name="removeImage" type="checkbox" />
            {t("Remove current image")}
          </label>
        </div>
      )}
      {previewUrl && (
        <div className="announcement-image-selected-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={t("Selected announcement image")} />
          <small>{selectedFileName}</small>
        </div>
      )}
      <label className="announcement-image-picker">
        <input
          name="image"
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          aria-label={t("Choose announcement image")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setSelectedFileName(file?.name ?? "");
            setPreviewUrl((current) => {
              if (current) URL.revokeObjectURL(current);
              return file ? URL.createObjectURL(file) : null;
            });
          }}
        />
        <span className="button ghost-button announcement-image-choose">
          <ImagePlus size={15} /> {t("Choose announcement image")}
        </span>
        <small>{t("JPEG, PNG or WebP · maximum 10 MB.")}</small>
      </label>
    </div>
  );
}

function ContentList({
  items,
  onEdit,
  onRemove,
  onRetry,
  retryLabel,
}: {
  items: {
    id: number;
    title: string;
    note: string;
    meta?: string;
    retryable?: boolean;
  }[];
  onEdit?: (id: number) => void;
  onRetry?: (id: number) => void;
  retryLabel?: string;
  onRemove: (id: number) => void;
}) {
  return (
    <div className="home-admin-list">
      {items.map((item) => (
        <div key={item.id}>
          <span>
            <strong>{item.title}</strong>
            {item.note && <small>{item.note}</small>}
            {item.meta && (
              <small className="delivery-status">{item.meta}</small>
            )}
          </span>
          <span className="inline-row-actions">
            {onEdit && (
              <button
                className="icon-button"
                type="button"
                onClick={() => onEdit(item.id)}
                aria-label={`Edit ${item.title}`}
              >
                <Pencil size={15} />
              </button>
            )}
            {onRetry && item.retryable === true && (
              <button
                className="icon-button"
                type="button"
                onClick={() => onRetry(item.id)}
                aria-label={`Retry delivery for ${item.title}`}
                title={retryLabel}
              >
                <RotateCcw size={15} />
              </button>
            )}
            <button
              className="icon-button"
              type="button"
              onClick={() => onRemove(item.id)}
              aria-label={`Archive ${item.title}`}
            >
              <Trash2 size={15} />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function localDateTime() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function inputDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function announcementStatus(
  item: AnnouncementDto,
  t: (value: string) => string,
) {
  if (!item.active) return t("Archived");
  if (new Date(item.publishedAt).getTime() > Date.now()) {
    return `${t("Scheduled")} · ${new Date(item.publishedAt).toLocaleString()}`;
  }
  return item.pinned ? t("Pinned") : t("Published");
}

function deliveryStatus(item: AnnouncementDto, t: (value: string) => string) {
  if (!item.deliveries?.length) return t("Delivery not queued");
  return item.deliveries
    .map((delivery) => {
      const channel =
        delivery.channel === "google_chat" ? "Google Chat" : t("Email");
      const error = delivery.lastError ? ` · ${delivery.lastError}` : "";
      const status =
        delivery.status === "sent"
          ? t("Accepted by provider")
          : delivery.status === "uncertain" ||
              (delivery.status === "pending" && delivery.attempts > 0)
            ? t("Provider outcome uncertain — verify before retry")
            : delivery.status === "pending"
              ? t("Delivery pending")
              : delivery.status === "failed"
                ? t("Delivery failed")
                : delivery.status === "skipped"
                  ? t("Delivery skipped")
                  : t(delivery.status);
      return `${channel}: ${status} (${delivery.attempts})${error}`;
    })
    .join(" · ");
}
