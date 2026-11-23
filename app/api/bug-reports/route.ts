import { getDb } from "@/db";
import { auditEvents, bugReports, notifications, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
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

export async function GET() {
  const user = await getCurrentUser();
  return Response.json({ reports: await getUserBugReports(user) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user.employeeId) {
    return Response.json(
      { error: "Your account must be linked to an employee profile." },
      { status: 403 },
    );
  }

  try {
    const form = await request.formData();
    const parsed = bugDescriptionSchema.safeParse(form.get("description"));
    if (!parsed.success) {
      return Response.json(
        { error: "Describe the issue in at least 10 characters." },
        { status: 400 },
      );
    }
    const screenshot = validatePrivateImage(form.get("screenshot"));
    const stored = await storePrivateFile({
      file: screenshot,
      kind: "bug_screenshot",
      category: "bug",
      ownerEmployeeId: user.employeeId,
      user,
    });

    try {
      const [created] = await getDb()
        .insert(bugReports)
        .values({
          reporterEmail: user.email,
          employeeId: user.employeeId,
          description: parsed.data,
          screenshotFileId: stored.id,
        })
        .returning();
      await attachStoredFile(stored.id, "bug_report", String(created.id));
      const recipients = (
        await getDb()
          .select({ email: users.email })
          .from(users)
          .where(eq(users.role, "super_admin"))
      )
        .map(({ email }) => email)
        .filter((email) => email !== user.email);
      await getDb()
        .insert(notifications)
        .values(
          recipients.map((email) => ({
            userEmail: email,
            title: "Нове повідомлення про помилку",
            message: `${user.email}: ${parsed.data.slice(0, 120)}`,
            href: "/settings?tab=bugs",
          })),
        );
      await getDb()
        .insert(auditEvents)
        .values({
          actorEmail: user.email,
          action: "bug_report.created",
          entityType: "bug_report",
          entityId: String(created.id),
          details: parsed.data.slice(0, 300),
        });
      return Response.json({ report: created }, { status: 201 });
    } catch (error) {
      await deleteStoredFile(stored.id, user);
      throw error;
    }
  } catch (error) {
    return applicationErrorResponse(error);
  }
}
