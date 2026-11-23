"use client";

import Link from "next/link";
import { useState } from "react";
import { Link2, Megaphone, Pencil, Plus, Users, X } from "lucide-react";
import { HomeContentSettings } from "@/components/admin/HomeContentSettings";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import type {
  AnnouncementDto,
  CompanyEventDto,
  CompanyLinkDto,
} from "@/modules/admin/types";

export function HomeContentManager({
  events,
  announcements,
  companyLinks,
  section,
  action = "create",
}: {
  events: CompanyEventDto[];
  announcements: AnnouncementDto[];
  companyLinks: CompanyLinkDto[];
  section: "announcements" | "events" | "links";
  action?: "create" | "edit";
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <>
      <button
        className={
          action === "create"
            ? "button primary-button"
            : "button ghost-button compact-button"
        }
        type="button"
        onClick={() => setOpen(true)}
      >
        {action === "create" ? <Plus size={16} /> : <Pencil size={15} />}
        {action === "create" ? t("Create") : t("Edit")}
      </button>
      {open && (
        <DialogBackdrop
          className="home-manager-backdrop"
          onClose={() => setOpen(false)}
        >
          <section
            className="home-manager-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-manager-title"
          >
            <header>
              <div>
                <span className="eyebrow">{t("Home administration")}</span>
                <h2 id="home-manager-title">
                  {section === "announcements"
                    ? t("Announcements")
                    : section === "events"
                      ? t("Planned events")
                      : t("Company links")}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("Close")}
              >
                <X size={18} />
              </button>
            </header>
            {message && (
              <p className="settings-toast inline-toast">{message}</p>
            )}
            <HomeContentSettings
              events={events}
              announcements={announcements}
              companyLinks={companyLinks}
              section={section}
              initialView={action}
              onMessage={setMessage}
              onSaved={() => setOpen(false)}
            />
          </section>
        </DialogBackdrop>
      )}
    </>
  );
}

export function AnnouncementPopup({
  announcement,
  readOnlyPreview = false,
}: {
  announcement: AnnouncementDto | null;
  readOnlyPreview?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(Boolean(announcement));

  if (!announcement || !open) return null;

  async function dismiss() {
    setOpen(false);
    if (readOnlyPreview) return;
    await fetch(`/api/announcements/${announcement!.id}/dismiss`, {
      method: "POST",
    }).catch(() => undefined);
  }

  return (
    <DialogBackdrop
      className="announcement-popup-backdrop"
      onClose={() => void dismiss()}
      confirmWhenDirty={false}
    >
      <article
        className="announcement-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-popup-title"
      >
        <button
          className="announcement-popup-close"
          type="button"
          onClick={dismiss}
          aria-label={t("Dismiss announcement")}
        >
          <X size={18} />
        </button>
        <span className="announcement-popup-icon">
          <Megaphone size={24} />
        </span>
        <span className="eyebrow">{t("Latest announcement")}</span>
        <h2 id="announcement-popup-title">{announcement.title}</h2>
        {announcement.imageFileId && !readOnlyPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="announcement-popup-image"
            src={`/api/files/${announcement.imageFileId}?preview=1`}
            alt=""
          />
        )}
        <div
          className="announcement-popup-body"
          dangerouslySetInnerHTML={{ __html: announcement.body }}
        />
        <div className="announcement-popup-actions">
          <Link
            className="button primary-button"
            href={`/announcements/${announcement.id}`}
            onClick={dismiss}
          >
            {t("Read announcement")}
          </Link>
          <button
            className="button ghost-button"
            type="button"
            onClick={dismiss}
          >
            {t("Close")}
          </button>
        </div>
      </article>
    </DialogBackdrop>
  );
}

type AbsentPerson = {
  id: number;
  firstName: string;
  lastName: string;
  endDate: string;
  leaveName: string;
};

export function AbsenceWidget({ people }: { people: AbsentPerson[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const visible = people.slice(0, 5);

  return (
    <article className="panel home-side-card">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t("Who’s out")}</p>
          <h2>{t("Absent today")}</h2>
        </div>
        <Users size={19} />
      </div>
      <div className="people-stack compact-stack">
        {visible.map((person) => (
          <AbsentPersonRow person={person} key={person.id} />
        ))}
        {people.length === 0 && (
          <p className="muted">{t("Everyone is available today.")}</p>
        )}
      </div>
      {people.length > 5 && (
        <button
          className="button ghost-button full-button"
          type="button"
          onClick={() => setOpen(true)}
        >
          {t("View everyone absent")} · {people.length}
        </button>
      )}
      {open && (
        <DialogBackdrop
          className="home-manager-backdrop"
          onClose={() => setOpen(false)}
          confirmWhenDirty={false}
        >
          <section
            className="absence-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="absence-dialog-title"
          >
            <header>
              <h2 id="absence-dialog-title">{t("Absent today")}</h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("Close")}
              >
                <X size={18} />
              </button>
            </header>
            <div className="people-stack">
              {people.map((person) => (
                <AbsentPersonRow person={person} key={person.id} />
              ))}
            </div>
          </section>
        </DialogBackdrop>
      )}
    </article>
  );
}

function AbsentPersonRow({ person }: { person: AbsentPerson }) {
  const { t } = useI18n();
  return (
    <Link className="person-row" href={`/employees/${person.id}`}>
      <span className="avatar small">
        {person.firstName[0]}
        {person.lastName[0]}
      </span>
      <span className="person-copy">
        <strong>
          {person.firstName} {person.lastName}
        </strong>
        <small>
          {t(person.leaveName)} · {t("through")} {person.endDate}
        </small>
      </span>
    </Link>
  );
}

export function CopyAnnouncementLink() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="button ghost-button"
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
      }}
    >
      <Link2 size={16} /> {copied ? t("Link copied") : t("Copy link")}
    </button>
  );
}
