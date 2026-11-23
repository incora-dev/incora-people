import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { TeamTimesheets } from "@/components/time/TeamTimesheets";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getDateContext } from "@/modules/shared/date";
import { getTeamTimesheets } from "@/modules/time/queries";
import { getServerI18n } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Team timesheets" };
export const dynamic = "force-dynamic";

export default async function TeamTimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.approveTime) {
    return (
      <section className="panel forbidden-panel">
        <ShieldAlert size={28} />
        <h1>{t("Time approval access required")}</h1>
        <p>{t("Your access group cannot review team timesheets.")}</p>
      </section>
    );
  }
  const requestedMonth = (await searchParams).month ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
    ? requestedMonth
    : getDateContext().monthKey;
  const rows = await getTeamTimesheets(user, month);
  return <TeamTimesheets initialRows={rows} month={month} />;
}
