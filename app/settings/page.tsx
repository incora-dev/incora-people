import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { AdminSettings } from "@/components/AdminSettings";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getAdminSettingsData, getAuditEvents } from "@/lib/data";
import { getIdentityConfiguration } from "@/lib/runtime-config";
import { getServerI18n } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Admin settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { t } = await getServerI18n();
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.manageSettings) {
    return (
      <section className="panel forbidden-panel">
        <ShieldAlert size={28} />
        <h1>{t("Admin access required")}</h1>
        <p>{t("Your access group cannot change workspace policies.")}</p>
      </section>
    );
  }
  const [data, auditEvents] = await Promise.all([
    getAdminSettingsData(),
    access.viewAudit ? getAuditEvents() : Promise.resolve([]),
  ]);
  return (
    <AdminSettings
      {...data}
      auditEvents={auditEvents}
      currentUserRole={user.role}
      canViewAudit={access.viewAudit}
      identity={getIdentityConfiguration()}
    />
  );
}
