import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";
import { notFound } from "next/navigation";
import { CopyAnnouncementLink } from "@/components/home/HomeDashboardClient";
import { AnnouncementPoll } from "@/components/home/AnnouncementPoll";
import { AnnouncementEngagement } from "@/components/home/AnnouncementEngagement";
import { getCurrentUser } from "@/lib/auth";
import { getServerI18n } from "@/lib/i18n-server";
import {
  getAnnouncementPoll,
  getAnnouncementEngagement,
  getPublishedAnnouncement,
} from "@/modules/dashboard/queries";

export const metadata: Metadata = { title: "Announcement" };
export const dynamic = "force-dynamic";

export default async function AnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { locale, t } = await getServerI18n();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const user = await getCurrentUser();
  const [announcement, poll, engagement] = await Promise.all([
    getPublishedAnnouncement(id),
    getAnnouncementPoll(id, user.email, user.userId),
    getAnnouncementEngagement(id, user.email, user.userId),
  ]);
  if (!announcement) notFound();

  return (
    <section className="announcement-detail-page">
      <Link className="button ghost-button" href="/">
        <ArrowLeft size={16} /> {t("Back to home")}
      </Link>
      <article className="panel announcement-detail-card">
        <div className="announcement-detail-meta">
          <span className="announcement-icon">
            <Megaphone size={20} />
          </span>
          <span>
            {announcement.pinned && <strong>{t("Pinned")}</strong>}
            <small>{formatDate(announcement.publishedAt, locale)}</small>
          </span>
        </div>
        <h1>{announcement.title}</h1>
        {announcement.imageFileId && !user.isPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="announcement-detail-image"
            src={`/api/files/${announcement.imageFileId}?preview=1`}
            alt=""
          />
        )}
        <div
          className="announcement-detail-body"
          dangerouslySetInnerHTML={{ __html: announcement.body }}
        />
        {poll && (
          <AnnouncementPoll
            poll={poll}
            readOnlyPreview={user.isPreview === true}
          />
        )}
        {!user.isPreview && <CopyAnnouncementLink />}
        <AnnouncementEngagement
          announcementId={announcement.id}
          initialEngagement={engagement}
          readOnlyPreview={user.isPreview === true}
        />
      </article>
    </section>
  );
}

function formatDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Kyiv",
  }).format(new Date(value));
}
