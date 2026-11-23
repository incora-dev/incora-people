import { getDb } from "@/db";
import { auditEvents, bugReports, notifications, users } from "@/db/schema";
import { getApiClientUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { bugDescriptionSchema } from "@/modules/bugs/contracts";
import { getUserBugReports } from "@/modules/bugs/queries";
import {
  attachStoredFile,
  deleteStoredFile,
  storePrivateFile,
  validatePrivateImage,
} from "@/modules/files/storage";
import { applicationErrorResponse } from "@/modules/shared/application-error";
import { sendMobilePush } from "@/modules/notifications/push";

export async function GET(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  return Response.json({ reports: await getUserBugReports(client.user) });
}

export async function POST(request: Request) {
  const client = await getApiClientUser(request);
  if (!client?.user.employeeId)
    return Response.json(
      { error: "Employee account required." },
      { status: 403 },
    );
  try {
    const form = await request.formData();
    const parsed = bugDescriptionSchema.safeParse(form.get("description"));
    if (!parsed.success)
      return Response.json(
        { error: "Describe the issue in at least 10 characters." },
        { status: 400 },
      );
    const stored = await storePrivateFile({
      file: validatePrivateImage(form.get("screenshot")),
      kind: "bug_screenshot",
      category: "bug",
      ownerEmployeeId: client.user.employeeId,
      user: client.user,
    });
    try {
      const [report] = await getDb()
        .insert(bugReports)
        .values({
          reporterEmail: client.user.email,
          employeeId: client.user.employeeId,
          description: parsed.data,
          screenshotFileId: stored.id,
        })
        .returning();
      await attachStoredFile(stored.id, "bug_report", String(report.id));
      const recipients = (
        await getDb()
          .select({ email: users.email })
          .from(users)
          .where(eq(users.role, "super_admin"))
      )
        .map(({ email }) => email)
        .filter((email) => email !== client.user.email);
      await getDb()
        .insert(notifications)
        .values(
          recipients.map((userEmail) => ({
            userEmail,
            title: "Нове повідомлення про помилку",
            message: `${client.user.email}: ${parsed.data.slice(0, 120)}`,
            href: "/settings?tab=bugs",
          })),
        );
      await sendMobilePush(
        recipients,
        {
          title: "Нове повідомлення про помилку",
          body: `${client.user.email}: ${parsed.data.slice(0, 120)}`,
          href: "/admin",
        },
        `bug_report.created:${report.id}`,
      ).catch(() => undefined);
      await getDb()
        .insert(auditEvents)
        .values({
          actorEmail: client.user.email,
          action: "bug_report.created",
          entityType: "bug_report",
          entityId: String(report.id),
          details: `Created via ${client.clientType}: ${parsed.data.slice(0, 300)}`,
        });
      return Response.json({ report }, { status: 201 });
    } catch (error) {
      await deleteStoredFile(stored.id, client.user);
      throw error;
    }
  } catch (error) {
    return applicationErrorResponse(error);
  }
}
