import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  announcementComments,
  announcementReactions,
  auditEvents,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  getAnnouncementEngagement,
  getPublishedAnnouncement,
} from "@/modules/dashboard/queries";
import { parseJsonRequest } from "@/modules/shared/http";

const reactionSchema = z.object({
  action: z.literal("reaction"),
  emoji: z.enum(["👍", "❤️", "🎉", "👏", "😄", "🤔"]),
});

const commentSchema = z.object({
  action: z.literal("comment"),
  body: z.string().trim().min(1).max(2000),
});

const engagementSchema = z.discriminatedUnion("action", [
  reactionSchema,
  commentSchema,
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const announcementId = Number((await params).id);
  if (!Number.isInteger(announcementId) || announcementId <= 0) {
    return Response.json({ error: "Invalid announcement." }, { status: 400 });
  }
  if (!(await getPublishedAnnouncement(announcementId))) {
    return Response.json({ error: "Announcement not found." }, { status: 404 });
  }
  const parsed = await parseJsonRequest(request, engagementSchema);
  if (!parsed.ok) return parsed.response;

  const db = getDb();
  if (parsed.data.action === "comment") {
    const [comment] = await db
      .insert(announcementComments)
      .values({
        announcementId,
        userEmail: user.email,
        userId: user.userId,
        body: parsed.data.body,
      })
      .returning();
    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "announcement.comment_created",
      entityType: "announcement",
      entityId: String(announcementId),
      details: `Comment ${comment.id}`,
    });
  } else {
    const [existing] = await db
      .select({ id: announcementReactions.id })
      .from(announcementReactions)
      .where(
        and(
          eq(announcementReactions.announcementId, announcementId),
          user.userId
            ? or(
                eq(announcementReactions.userId, user.userId),
                eq(announcementReactions.userEmail, user.email),
              )
            : eq(announcementReactions.userEmail, user.email),
          eq(announcementReactions.emoji, parsed.data.emoji),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .delete(announcementReactions)
        .where(eq(announcementReactions.id, existing.id));
    } else {
      await db.insert(announcementReactions).values({
        announcementId,
        userEmail: user.email,
        userId: user.userId,
        emoji: parsed.data.emoji,
      });
    }
  }

  return Response.json(
    await getAnnouncementEngagement(announcementId, user.email, user.userId),
  );
}
