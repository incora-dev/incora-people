import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications as notificationsTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getNotifications } from "@/lib/data";
import { updateNotificationsSchema } from "@/modules/notifications/contracts";
import { parseJsonRequest } from "@/modules/shared/http";

export async function GET() {
  const user = await getCurrentUser();
  const notifications = await getNotifications(user);
  return Response.json({ notifications });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  const parsed = await parseJsonRequest(request, updateNotificationsSchema);
  if (!parsed.ok) return parsed.response;

  const now = new Date().toISOString();
  const db = getDb();
  if (parsed.data.all) {
    await db
      .update(notificationsTable)
      .set({ readAt: now })
      .where(
        and(
          user.userId
            ? or(
                eq(notificationsTable.userId, user.userId),
                eq(notificationsTable.userEmail, user.email),
              )
            : eq(notificationsTable.userEmail, user.email),
          isNull(notificationsTable.readAt),
        ),
      );
  } else {
    await db
      .update(notificationsTable)
      .set({ readAt: now })
      .where(
        and(
          eq(notificationsTable.id, parsed.data.id!),
          user.userId
            ? or(
                eq(notificationsTable.userId, user.userId),
                eq(notificationsTable.userEmail, user.email),
              )
            : eq(notificationsTable.userEmail, user.email),
        ),
      );
  }

  return Response.json({ ok: true, readAt: now });
}
