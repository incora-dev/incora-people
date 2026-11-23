import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarRange,
  CheckCircle2,
  ExternalLink,
  Link2,
  ListTodo,
  Megaphone,
  PartyPopper,
  Umbrella,
} from "lucide-react";
import {
  AbsenceWidget,
  AnnouncementPopup,
} from "@/components/home/HomeDashboardClient";
import { HomeContentManager } from "@/components/home/HomeDashboardClient";
import { getCurrentUser, getAccessPolicy } from "@/lib/auth";
import { getEmployee } from "@/lib/data";
import { plainAnnouncementText } from "@/modules/announcements/content";
import { getServerI18n } from "@/lib/i18n-server";
import { getHomeContentAdminData } from "@/modules/admin/queries";
import { getDashboardData } from "@/modules/dashboard/queries";
import { getDateContext } from "@/modules/shared/date";
import { formatCount } from "@/lib/i18n";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function Home() {
  const { locale, t } = await getServerI18n();
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const date = getDateContext();
  const [stats, employee, adminData] = await Promise.all([
    getDashboardData(user, date),
    user.employeeId ? getEmployee(user.employeeId) : Promise.resolve(undefined),
    access.manageSettings && !user.isPreview
      ? getHomeContentAdminData()
      : Promise.resolve(null),
  ]);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Europe/Kyiv",
    }).format(new Date()),
  );
  const greeting =
    hour < 12
      ? t("Good morning")
      : hour < 18
        ? t("Good afternoon")
        : t("Good evening");
  const greetingName = employee?.firstName ?? user.email.split("@")[0];

  return (
    <>
      <AnnouncementPopup
        announcement={stats.popupAnnouncement}
        readOnlyPreview={user.isPreview === true}
      />
      <section className="hero-row home-hero-v2">
        <div>
          <p className="eyebrow">{formatHeadingDate(date.today, locale)}</p>
          <h1>
            {greeting},{" "}
            {employee ? (
              <Link
                className="greeting-profile-link"
                href={`/employees/${employee.id}`}
              >
                {greetingName}
              </Link>
            ) : (
              greetingName
            )}
            .
          </h1>
          <p className="lede">
            {t("Here’s what’s happening across INCORA today.")}
          </p>
        </div>
      </section>

      <section className="home-layout-v2">
        <div className="home-announcement-stage">
          <div className="home-section-heading">
            <div>
              <p className="eyebrow">{t("Company news")}</p>
              <h2>{t("Announcements")}</h2>
            </div>
            <span className="home-heading-actions">
              {adminData && (
                <>
                  <HomeContentManager
                    {...adminData}
                    section="announcements"
                    action="create"
                  />
                  <HomeContentManager
                    {...adminData}
                    section="announcements"
                    action="edit"
                  />
                </>
              )}
              <Megaphone size={21} />
            </span>
          </div>
          <div className="home-announcement-feed">
            {stats.announcements.map((announcement) => (
              <Link
                className="home-announcement-card"
                href={`/announcements/${announcement.id}`}
                key={announcement.id}
              >
                <div className="announcement-card-meta">
                  <span>{formatDate(announcement.publishedAt, locale)}</span>
                  {announcement.pinned && <strong>{t("Pinned")}</strong>}
                </div>
                {announcement.imageFileId && !user.isPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="home-announcement-image"
                    src={`/api/files/${announcement.imageFileId}?preview=1`}
                    alt=""
                  />
                )}
                <h3>{announcement.title}</h3>
                <p>{plainAnnouncementText(announcement.body)}</p>
                <span className="text-link">
                  {t("Read announcement")} <ArrowUpRight size={15} />
                </span>
              </Link>
            ))}
            {stats.announcements.length === 0 && (
              <div className="home-announcement-empty">
                <Megaphone size={24} />
                <p>{t("No announcements right now.")}</p>
              </div>
            )}
          </div>
        </div>

        <aside className="home-sidebar-v2">
          <AbsenceWidget people={stats.whoIsOut} />

          <article className="panel home-side-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t("Work anniversaries")}</p>
                <h2>{t("Coming up")}</h2>
              </div>
              <PartyPopper size={19} />
            </div>
            <div className="people-stack compact-stack">
              {stats.anniversaries.map((person) => (
                <Link
                  className="person-row"
                  href={`/employees/${person.id}`}
                  key={person.id}
                >
                  <span className="avatar small">
                    {person.firstName[0]}
                    {person.lastName[0]}
                  </span>
                  <span className="person-copy">
                    <strong>
                      {person.firstName} {person.lastName}
                    </strong>
                    <small>
                      {formatShortDate(person.nextDate, locale)} ·{" "}
                      {formatCount(
                        locale,
                        person.years,
                        {
                          one: "рік в INCORA",
                          few: "роки в INCORA",
                          many: "років в INCORA",
                        },
                        { one: "year with INCORA", many: "years with INCORA" },
                      )}
                    </small>
                  </span>
                </Link>
              ))}
              {stats.anniversaries.length === 0 && (
                <p className="muted">{t("No upcoming anniversaries.")}</p>
              )}
            </div>
          </article>

          <article className="panel home-side-card home-personal-card">
            <div>
              <span className="home-card-icon">
                <Umbrella size={18} />
              </span>
              <span>
                <small>{t("My leave")}</small>
                <strong>
                  {stats.vacationAvailable} {t("days available")}
                </strong>
              </span>
            </div>
            <Link className="text-link" href="/leave">
              {t("Open")}
            </Link>
          </article>

          {stats.pendingApprovals > 0 && (
            <article className="panel home-side-card home-personal-card">
              <div>
                <span className="home-card-icon">
                  <CheckCircle2 size={18} />
                </span>
                <span>
                  <small>{t("Approvals")}</small>
                  <strong>
                    {stats.pendingApprovals} {t("request(s) waiting")}
                  </strong>
                </span>
              </div>
              <Link className="text-link" href="/leave#approvals">
                {t("Review")}
              </Link>
            </article>
          )}

          <article className="panel home-side-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t("My tasks")}</p>
                <h2>{t("What needs attention")}</h2>
              </div>
              <ListTodo size={19} />
            </div>
            <div className="home-content-list">
              {stats.personalTasks.map((task) => (
                <Link href="/tasks" key={task.id}>
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {task.dueDate
                        ? `${t("Due")} ${formatShortDate(task.dueDate, locale)}`
                        : t("No due date")}
                    </small>
                  </span>
                  <ArrowUpRight size={15} />
                </Link>
              ))}
              {stats.personalTasks.length === 0 && (
                <p className="muted">{t("No open tasks.")}</p>
              )}
            </div>
          </article>

          <article className="panel home-side-card home-content-admin-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t("Planned events")}</p>
                <h2>{t("Coming up")}</h2>
              </div>
              <span className="home-heading-actions">
                {adminData && (
                  <>
                    <HomeContentManager
                      {...adminData}
                      section="events"
                      action="create"
                    />
                    <HomeContentManager
                      {...adminData}
                      section="events"
                      action="edit"
                    />
                  </>
                )}
                <CalendarRange size={19} />
              </span>
            </div>
            <div className="home-content-list">
              {stats.plannedEvents.map((event) => (
                <div key={event.id}>
                  <span>
                    <strong>{event.title}</strong>
                    <small>
                      {formatEventDate(event.startsAt, locale)}
                      {event.location ? ` · ${event.location}` : ""}
                    </small>
                  </span>
                </div>
              ))}
              {stats.plannedEvents.length === 0 && (
                <p className="muted">{t("No planned events.")}</p>
              )}
            </div>
          </article>

          {(stats.companyLinks.length > 0 || Boolean(adminData)) && (
            <article className="panel home-side-card home-content-admin-card">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{t("Useful resources")}</p>
                  <h2>{t("Company links")}</h2>
                </div>
                <span className="home-heading-actions">
                  {adminData && (
                    <>
                      <HomeContentManager
                        {...adminData}
                        section="links"
                        action="create"
                      />
                      <HomeContentManager
                        {...adminData}
                        section="links"
                        action="edit"
                      />
                    </>
                  )}
                  <Link2 size={19} />
                </span>
              </div>
              <div className="company-link-grid compact-links">
                {stats.companyLinks.map((link) => (
                  <a
                    href={link.url}
                    key={link.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span>
                      <strong>{link.label}</strong>
                    </span>
                    <ExternalLink size={15} />
                  </a>
                ))}
              </div>
            </article>
          )}
        </aside>
      </section>
    </>
  );
}

function formatHeadingDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Kyiv",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatShortDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/Kyiv",
  }).format(new Date(value));
}

function formatEventDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(new Date(value));
}
