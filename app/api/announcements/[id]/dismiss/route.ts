import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { announcementDismissals, announcements } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json(
      { error: "Invalid announcement id." },
      { status: 400 },
    );
  }

  const db = getDb();
  const [announcement] = await db
    .select({ id: announcements.id })
    .from(announcements)
    .where(eq(announcements.id, id))
    .limit(1);
  if (!announcement) {
    return Response.json({ error: "Announcement not found." }, { status: 404 });
  }

  await db
    .insert(announcementDismissals)
    .values({
      announcementId: id,
      userEmail: user.email,
      userId: user.userId,
    })
    .onConflictDoUpdate({
      target: [
        announcementDismissals.userEmail,
        announcementDismissals.announcementId,
      ],
      set: {
        dismissedAt: new Date().toISOString(),
        userId: user.userId,
      },
    });

  return Response.json({ ok: true });
}
