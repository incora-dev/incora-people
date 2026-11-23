import { and, eq, like } from "drizzle-orm";
import { getDb } from "@/db";
import {
  announcementPolls,
  announcements,
  auditEvents,
  storedFiles,
} from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { validatePollQuestions } from "@/modules/announcements/polls";
import { deleteStoredFile } from "@/modules/files/storage";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.manageSettings) {
    return Response.json(
      { error: "Announcement administration access required." },
      { status: 403 },
    );
  }
  const announcementId = Number((await params).id);
  if (!Number.isInteger(announcementId) || announcementId <= 0) {
    return Response.json(
      { error: "Invalid announcement id." },
      { status: 400 },
    );
  }
  const [announcement] = await getDb()
    .select({ id: announcements.id, title: announcements.title })
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1);
  if (!announcement) {
    return Response.json({ error: "Announcement not found." }, { status: 404 });
  }
  let payload: { pollQuestions?: unknown };
  try {
    payload = (await request.json()) as { pollQuestions?: unknown };
  } catch {
    return Response.json(
      { error: "Invalid questionnaire payload." },
      { status: 400 },
    );
  }
  const rawQuestions =
    typeof payload.pollQuestions === "string"
      ? payload.pollQuestions
      : JSON.stringify(payload.pollQuestions ?? []);
  const questions = validatePollQuestions(rawQuestions);
  if (!questions.ok) {
    return Response.json({ error: questions.error }, { status: 400 });
  }
  const db = getDb();
  const [existingPoll] = await db
    .select()
    .from(announcementPolls)
    .where(eq(announcementPolls.announcementId, announcementId))
    .limit(1);
  let poll;
  if (questions.value.length > 0) {
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
            announcementId,
            question: announcement.title,
            optionsJson: "[]",
            questionsJson: JSON.stringify(questions.value),
          })
          .returning();
  } else {
    if (existingPoll) {
      await db
        .update(announcementPolls)
        .set({ active: false, questionsJson: "[]" })
        .where(eq(announcementPolls.id, existingPoll.id));
    }
    poll = null;
  }

  // Keep R2 and D1 aligned with the current questionnaire. An option image is
  // private state owned by its option, so removing an option or clearing its
  // image must remove the previous object as well. This also cleans up files
  // left by older versions that allowed multiple uploads for one option.
  const pollOptions = questions.value.flatMap((question) =>
    Array.isArray(question.options)
      ? question.options.map((option) => ({ question, option }))
      : [],
  );
  const expectedImageIds = new Set(
    pollOptions
      .map(({ option }) =>
        typeof option.imageUrl === "string"
          ? option.imageUrl.match(/^\/api\/files\/([^?]+)/)?.[1]
          : undefined,
      )
      .filter((id): id is string => Boolean(id)),
  );
  const validOptionRelations = new Set(
    pollOptions.map(
      ({ question, option }) => `${announcementId}:${question.id}:${option.id}`,
    ),
  );
  const attachedImages = await db
    .select({
      id: storedFiles.id,
      relatedEntityId: storedFiles.relatedEntityId,
    })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.kind, "announcement_poll_option_image"),
        eq(storedFiles.relatedEntityType, "announcement_poll_option"),
        like(storedFiles.relatedEntityId, `${announcementId}:%`),
      ),
    );
  await Promise.all(
    attachedImages
      .filter(
        (file) =>
          !file.relatedEntityId ||
          !validOptionRelations.has(file.relatedEntityId) ||
          !expectedImageIds.has(file.id),
      )
      .map((file) => deleteStoredFile(file.id, user)),
  );

  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: "announcement.poll_updated",
    entityType: "announcement",
    entityId: String(announcementId),
    details: `${questions.value.length} questions`,
  });
  return Response.json({
    poll: poll
      ? { ...poll, title: poll.question, questions: questions.value }
      : null,
  });
}
