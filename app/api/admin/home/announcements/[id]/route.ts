import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  announcementDeliveries,
  announcementPolls,
  announcements,
  auditEvents,
} from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { announcementSchema } from "@/modules/admin/contracts";
import {
  enqueueAnnouncementDelivery,
  processAnnouncementDeliveries,
} from "@/modules/announcements/delivery";
import { parseJsonRequest } from "@/modules/shared/http";
import { sanitizeAnnouncementHtml } from "@/modules/announcements/content";
import { validatePollQuestions } from "@/modules/announcements/polls";
import { normalizeDateTime } from "@/modules/shared/date";
import { getWorkspaceTimezone } from "@/modules/settings/system";

export async function PATCH(
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
  const parsed = await parseJsonRequest(request, announcementSchema);
  if (!parsed.ok) return parsed.response;
  const db = getDb();
  const { pollQuestions, ...announcementData } = parsed.data;
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
  const questions = validatePollQuestions(pollQuestions);
  if (!questions.ok)
    return Response.json({ error: questions.error }, { status: 400 });
  const [existingAnnouncement] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, id))
    .limit(1);
  if (!existingAnnouncement) {
    return Response.json({ error: "Announcement not found." }, { status: 404 });
  }
  const [announcement] = await db
    .update(announcements)
    .set({
      ...announcementData,
      body: sanitizeAnnouncementHtml(announcementData.body),
      active: true,
      publishedAt,
      expiresAt,
    })
    .where(eq(announcements.id, id))
    .returning();
  const [existingPoll] = await db
    .select()
    .from(announcementPolls)
    .where(eq(announcementPolls.announcementId, id))
    .limit(1);
  let poll = null;
  if (questions.value.length) {
    [poll] = existingPoll
      ? await db
          .update(announcementPolls)
          .set({
            question: announcement.title,
            optionsJson: "[]",
            questionsJson: JSON.stringify(questions.value),
            active: true,
          })
          .where(eq(announcementPolls.id, existingPoll.id))
          .returning()
      : await db
          .insert(announcementPolls)
          .values({
            announcementId: id,
            question: announcement.title,
            optionsJson: "[]",
            questionsJson: JSON.stringify(questions.value),
          })
          .returning();
  } else if (existingPoll) {
    await db
      .update(announcementPolls)
      .set({ active: false })
      .where(eq(announcementPolls.id, existingPoll.id));
  }
  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: "update",
    entityType: "announcement",
    entityId: String(id),
    details: announcement.title,
  });
  const publicationChanged =
    existingAnnouncement.publishedAt !== announcement.publishedAt;
  if (publicationChanged) {
    await enqueueAnnouncementDelivery(
      announcement.id,
      announcement.publishedAt,
    );
    if (new Date(announcement.publishedAt).getTime() <= Date.now()) {
      await processAnnouncementDeliveries(
        new URL(request.url).origin,
        announcement.id,
      );
    }
  }
  const deliveries = await db
    .select()
    .from(announcementDeliveries)
    .where(eq(announcementDeliveries.announcementId, announcement.id));
  return Response.json({
    announcement: {
      ...announcement,
      poll: poll
        ? { ...poll, title: poll.question, questions: questions.value }
        : null,
      deliveries,
    },
  });
}

export async function DELETE(
  _request: Request,
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
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: "Invalid announcement id." },
      { status: 400 },
    );
  const db = getDb();
  await db
    .update(announcements)
    .set({ active: false })
    .where(eq(announcements.id, id));
  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: "archive",
    entityType: "announcement",
    entityId: String(id),
  });
  return Response.json({ ok: true });
}
