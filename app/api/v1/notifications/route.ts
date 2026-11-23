import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications as notificationsTable } from "@/db/schema";
import { getApiClientUser } from "@/lib/auth";
import { getNotifications } from "@/modules/notifications/queries";
import { updateNotificationsSchema } from "@/modules/notifications/contracts";
import { parseJsonRequest } from "@/modules/shared/http";

export async function GET(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  return Response.json({
    notifications: await getNotifications(client.user),
  });
}

export async function PATCH(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  const parsed = await parseJsonRequest(request, updateNotificationsSchema);
  if (!parsed.ok) return parsed.response;
  const now = new Date().toISOString();
  const where = parsed.data.all
    ? and(
        client.user.userId
          ? or(
              eq(notificationsTable.userId, client.user.userId),
              eq(notificationsTable.userEmail, client.user.email),
            )
          : eq(notificationsTable.userEmail, client.user.email),
        isNull(notificationsTable.readAt),
      )
    : and(
        eq(notificationsTable.id, parsed.data.id!),
        client.user.userId
          ? or(
              eq(notificationsTable.userId, client.user.userId),
              eq(notificationsTable.userEmail, client.user.email),
            )
          : eq(notificationsTable.userEmail, client.user.email),
      );
  await getDb().update(notificationsTable).set({ readAt: now }).where(where);
  return Response.json({ ok: true, readAt: now });
}
