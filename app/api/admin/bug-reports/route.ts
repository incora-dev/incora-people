import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, bugReports, notifications } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { updateBugReportSchema } from "@/modules/bugs/contracts";
import { getBugReports } from "@/modules/bugs/queries";
import { parseJsonRequest } from "@/modules/shared/http";

export async function GET() {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings) {
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  }
  return Response.json({ reports: await getBugReports() });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings) {
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  }
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Invalid bug report." }, { status: 400 });
  }
  const parsed = await parseJsonRequest(request, updateBugReportSchema);
  if (!parsed.ok) return parsed.response;

  const [existing] = await getDb()
    .select()
    .from(bugReports)
    .where(eq(bugReports.id, id))
    .limit(1);
  if (!existing) {
    return Response.json({ error: "Bug report not found." }, { status: 404 });
  }
  const resolved = parsed.data.status === "resolved";
  const now = new Date().toISOString();
  const [updated] = await getDb()
    .update(bugReports)
    .set({
      status: parsed.data.status,
      resolvedAt: resolved ? now : null,
      resolvedByEmail: resolved ? user.email : null,
    })
    .where(eq(bugReports.id, id))
    .returning();

  if (existing.status !== parsed.data.status) {
    await getDb()
      .insert(notifications)
      .values({
        userEmail: existing.reporterEmail,
        title: resolved
          ? "Помилку виправлено"
          : "Повідомлення про помилку відкрито повторно",
        message: resolved
          ? "Ваше повідомлення позначено як виправлене."
          : "Адміністратор повторно відкрив ваше повідомлення про помилку.",
        href: "/profile/settings#bug-reports",
      });
    await getDb()
      .insert(auditEvents)
      .values({
        actorEmail: user.email,
        action: resolved ? "bug_report.resolved" : "bug_report.reopened",
        entityType: "bug_report",
        entityId: String(id),
        details: existing.description.slice(0, 300),
      });
  }
  return Response.json({ report: updated });
}
