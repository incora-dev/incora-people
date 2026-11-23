import type { Metadata } from "next";
import { ExpenseWorkspace } from "@/components/ExpenseWorkspace";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { hasOrganizationScope } from "@/lib/auth";
import { getReimbursementOverview } from "@/lib/data";
import { getServerI18n } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Reimbursements" };
export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
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
  const data = await getReimbursementOverview(user.employeeId, user);
  return (
    <ExpenseWorkspace
      {...data}
      canApprove={
        access.approveExpenses &&
        (hasOrganizationScope(user) || user.role === "manager") &&
        !user.isPreview
      }
      readOnlyPreview={user.isPreview === true}
    />
  );
}
