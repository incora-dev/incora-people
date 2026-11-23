import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { employees, users } from "@/db/schema";
import { canManageProjects, getAccessPolicy, getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  const [access, manageProjects] = await Promise.all([
    getAccessPolicy(user),
    canManageProjects(user),
  ]);
  const [employee] = user.employeeId
    ? await getDb()
        .select()
        .from(employees)
        .where(eq(employees.id, user.employeeId))
        .limit(1)
    : [];
  const [account] = await getDb()
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.email, user.email))
    .limit(1);
  return Response.json({
    user: {
      ...user,
      firstName: employee?.firstName ?? user.email.split("@")[0],
      lastName: employee?.lastName ?? "",
      jobTitle: employee?.jobTitle ?? "Employee",
      locale: account?.locale ?? "uk",
    },
    access: { ...access, manageProjects },
    preview: user.isPreview
      ? {
          state: "active",
          targetName: user.previewTargetName ?? "",
          expiresAt: user.previewExpiresAt ?? "",
          returnPath: user.previewReturnPath ?? "/employees",
        }
      : user.previewNotice === "expired"
        ? {
            state: "expired",
            targetName: user.previewTargetName ?? "",
            expiresAt: "",
            returnPath: user.previewReturnPath ?? "/employees",
          }
        : null,
  });
}
