import { getDb } from "@/db";
import { announcements, auditEvents, notifications, users } from "@/db/schema";
import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { getAnnouncements } from "@/lib/data";
import { announcementSchema } from "@/modules/admin/contracts";
import { parseJsonRequest } from "@/modules/shared/http";
import { sendMobilePush } from "@/modules/notifications/push";
import { normalizeDateTime } from "@/modules/shared/date";
import { getWorkspaceTimezone } from "@/modules/settings/system";

export async function GET(request: Request) {
  const client = await getApiClientUser(request);
  if (!client) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const access = await getAccessPolicy(client.user);
  return Response.json({
    announcements: await getAnnouncements(),
    canCreate: access.manageSettings,
  });
}

export async function POST(request: Request) {
  const client = await getApiClientUser(request);
  if (!client) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const access = await getAccessPolicy(client.user);
  if (!access.manageSettings) {
    return Response.json(
      { error: "Admin settings access required." },
      { status: 403 },
    );
  }
  const parsed = await parseJsonRequest(request, announcementSchema);
  if (!parsed.ok) return parsed.response;
  const timeZone = await getWorkspaceTimezone();
  const publishedAt = normalizeDateTime(parsed.data.publishedAt, timeZone);
  const expiresAt = parsed.data.expiresAt
    ? normalizeDateTime(parsed.data.expiresAt, timeZone)
    : null;
  if (!publishedAt || (parsed.data.expiresAt && !expiresAt)) {
    return Response.json(
      { error: "Invalid announcement date." },
      { status: 400 },
    );
  }
  if (expiresAt && expiresAt <= publishedAt) {
    return Response.json(
      { error: "Announcement expiry must be after publication." },
      { status: 400 },
    );
  }

  const [announcement] = await getDb()
    .insert(announcements)
    .values({
      ...parsed.data,
      publishedAt,
      expiresAt,
      createdByEmail: client.user.email,
    })
    .returning();
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: client.user.email,
      action: "create",
      entityType: "announcement",
      entityId: String(announcement.id),
      details: announcement.title,
    });
  const recipients = (
    await getDb().select({ email: users.email }).from(users)
  ).map(({ email }) => email);
  if (recipients.length) {
    await getDb()
      .insert(notifications)
      .values(
        recipients.map((userEmail) => ({
          userEmail,
          title: announcement.title,
          message: announcement.body.slice(0, 240),
          href: `/announcements/${announcement.id}`,
        })),
      );
    await sendMobilePush(
      recipients,
      {
        title: announcement.title,
        body: announcement.body.slice(0, 240),
        href: `/announcements/${announcement.id}`,
      },
      `announcement.published:${announcement.id}`,
    ).catch(() => undefined);
  }
  return Response.json({ announcement }, { status: 201 });
}
