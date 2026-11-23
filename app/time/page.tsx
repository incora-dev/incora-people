import type { Metadata } from "next";
import Link from "next/link";
import { UsersRound } from "lucide-react";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getActiveTimeProjects, getTimeOverview } from "@/lib/data";
import { TimeTracker } from "@/components/TimeTracker";
import { getServerI18n } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Time" };

export const dynamic = "force-dynamic";

export default async function TimePage() {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!user.employeeId) {
    return (
      <section className="panel forbidden-panel">
        <h1>{t("Employee account required")}</h1>
        <p>
          {t("Your authenticated account is not linked to an employee record.")}
        </p>
      </section>
    );
  }
  const employeeId = user.employeeId;
  const [overview, projects] = await Promise.all([
    getTimeOverview(employeeId),
    getActiveTimeProjects(),
  ]);

  return (
    <>
      <section className="hero-row compact">
        <div>
          <p className="eyebrow">{t("Time foundations")}</p>
          <h1>{t("My time")}</h1>
          <p className="lede">
            {t("Track work sessions and review your recent days.")}
          </p>
        </div>
        <div className="page-actions">
          {access.approveTime && !user.isPreview && (
            <Link className="button ghost-button" href="/time/team">
              <UsersRound size={16} /> {t("Team timesheets")}
            </Link>
          )}
        </div>
      </section>
      <TimeTracker
        openEntry={overview.openEntry}
        openBreak={overview.openBreak}
        initialHistory={overview.history}
        initialBreaks={overview.breakHistory}
        absenceDays={overview.absenceDays}
        absenceAllocations={overview.absenceAllocations}
        initialSchedule={overview.schedule}
        initialDate={overview.date}
        initialTimeZone={overview.timeZone}
        periodLocked={overview.periodLocked}
        holidayDates={overview.holidayDates}
        projects={projects}
        readOnlyPreview={user.isPreview === true}
      />
    </>
  );
}
