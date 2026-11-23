import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, bugReports, notifications } from "@/db/schema";
import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { updateBugReportSchema } from "@/modules/bugs/contracts";
import { sendMobilePush } from "@/modules/notifications/push";
import { parseJsonRequest } from "@/modules/shared/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  if (!(await getAccessPolicy(client.user)).manageSettings)
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  const { id } = await params;
  const reportId = Number(id);
  const parsed = await parseJsonRequest(request, updateBugReportSchema);
  if (!Number.isInteger(reportId))
    return Response.json({ error: "Invalid bug report." }, { status: 400 });
  if (!parsed.ok) return parsed.response;
  const [existing] = await getDb()
    .select()
    .from(bugReports)
    .where(eq(bugReports.id, reportId))
    .limit(1);
  if (!existing)
    return Response.json({ error: "Bug report not found." }, { status: 404 });
  const resolved = parsed.data.status === "resolved";
  const [updated] = await getDb()
    .update(bugReports)
    .set({
      status: parsed.data.status,
      resolvedAt: resolved ? new Date().toISOString() : null,
      resolvedByEmail: resolved ? client.user.email : null,
    })
    .where(eq(bugReports.id, reportId))
    .returning();
  if (existing.status !== parsed.data.status) {
    await getDb()
      .insert(notifications)
      .values({
        userEmail: existing.reporterEmail,
        title: resolved
          ? "Помилку виправлено"
          : "Повідомлення відкрито повторно",
        message: resolved
          ? "Ваше повідомлення позначено як виправлене."
          : "Адміністратор повторно відкрив повідомлення.",
        href: "/profile/settings#bug-reports",
      });
    await sendMobilePush(
      [existing.reporterEmail],
      {
        title: resolved
          ? "Помилку виправлено"
          : "Повідомлення відкрито повторно",
        body: resolved
          ? "Ваше повідомлення позначено як виправлене."
          : "Адміністратор повторно відкрив повідомлення.",
        href: "/operations",
      },
      `bug_report.${parsed.data.status}:${reportId}`,
    ).catch(() => undefined);
    await getDb()
      .insert(auditEvents)
      .values({
        actorEmail: client.user.email,
        action: resolved ? "bug_report.resolved" : "bug_report.reopened",
        entityType: "bug_report",
        entityId: String(reportId),
        details: `${existing.description.slice(0, 250)} via mobile`,
      });
  }
  return Response.json({ report: updated });
}
