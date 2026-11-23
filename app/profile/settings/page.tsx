import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { PersonalSettings } from "@/components/PersonalSettings";
import { getCurrentUser } from "@/lib/auth";
import { normalizeLocale } from "@/lib/i18n";
import { getUserBugReports } from "@/modules/bugs/queries";

export const metadata: Metadata = { title: "Особисті налаштування" };
export const dynamic = "force-dynamic";

export default async function PersonalSettingsPage() {
  const user = await getCurrentUser();
  const [account] = await getDb()
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.email, user.email))
    .limit(1);
  return (
    <PersonalSettings
      initialLocale={normalizeLocale(account?.locale)}
      reports={await getUserBugReports(user)}
    />
  );
}
