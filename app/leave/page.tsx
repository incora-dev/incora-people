import type { Metadata } from "next";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getLeaveOverview } from "@/lib/data";
import { LeaveWorkspace } from "@/components/LeaveWorkspace";
import { getServerI18n } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Leave" };
export const dynamic = "force-dynamic";

export default async function LeavePage() {
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
  const overview = await getLeaveOverview(user.employeeId, user);

  return (
    <LeaveWorkspace
      balances={overview.balances}
      requests={overview.requests}
      pending={overview.pending}
      holidays={overview.holidays}
      workDays={overview.workDays}
      canApprove={access.approveLeave && !user.isPreview}
      readOnlyPreview={user.isPreview === true}
    />
  );
}
