import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { announcementDeliveries, announcements } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  enqueueAnnouncementDelivery,
  processAnnouncementDeliveries,
} from "@/modules/announcements/delivery";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings) {
    return Response.json(
      { error: "Admin settings access required." },
      { status: 403 },
    );
  }
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json(
      { error: "Invalid announcement id." },
      { status: 400 },
    );
  }
  const db = getDb();
  const [announcement] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, id))
    .limit(1);
  if (!announcement) {
    return Response.json({ error: "Announcement not found." }, { status: 404 });
  }
  if (
    !announcement.active ||
    (announcement.expiresAt &&
      new Date(announcement.expiresAt).getTime() <= Date.now())
  ) {
    return Response.json(
      { error: "Archived or expired announcements cannot be delivered." },
      { status: 409 },
    );
  }
  await enqueueAnnouncementDelivery(id, announcement.publishedAt);
  if (new Date(announcement.publishedAt).getTime() <= Date.now()) {
    await processAnnouncementDeliveries(new URL(request.url).origin, id);
  }
  const deliveries = await db
    .select()
    .from(announcementDeliveries)
    .where(eq(announcementDeliveries.announcementId, id));
  return Response.json({ deliveries });
}
