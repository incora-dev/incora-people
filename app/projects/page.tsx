import { ShieldAlert } from "lucide-react";
import { TimeProjectSettings } from "@/components/admin/TimeProjectSettings";
import { canManageProjects, getCurrentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { timeProjects } from "@/db/schema";
import { getServerI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const allowed = await canManageProjects(user);
  const { t } = await getServerI18n();
  if (!allowed)
    return (
      <section className="panel forbidden-panel">
        <ShieldAlert />
        <h1>{t("Project manager access required")}</h1>
      </section>
    );
  const projects = await getDb()
    .select()
    .from(timeProjects)
    .orderBy(timeProjects.name);
  return (
    <>
      <section className="page-heading-row">
        <div>
          <p className="eyebrow">PM</p>
          <h1>{t("Time projects")}</h1>
        </div>
      </section>
      <TimeProjectSettings projects={projects} />
    </>
  );
}
