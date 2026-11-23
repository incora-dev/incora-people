import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  announcementPolls,
  announcements,
  auditEvents,
  storedFiles,
} from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  attachStoredFile,
  deleteStoredFile,
  storePrivateFile,
  validatePrivateImage,
} from "@/modules/files/storage";
import { parsePollQuestions } from "@/modules/announcements/polls";
import { applicationErrorResponse } from "@/modules/shared/application-error";

export async function POST(
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
  if (!user.employeeId) {
    return Response.json(
      { error: "Employee account required." },
      { status: 400 },
    );
  }
  const announcementId = Number((await params).id);
  if (!Number.isInteger(announcementId) || announcementId <= 0) {
    return Response.json(
      { error: "Invalid announcement id." },
      { status: 400 },
    );
  }
  const form = await request.formData();
  const questionId = String(form.get("questionId") ?? "").trim();
  const optionId = String(form.get("optionId") ?? "").trim();
  if (!questionId || !optionId) {
    return Response.json(
      { error: "Question and option are required." },
      { status: 400 },
    );
  }
  const [announcement] = await getDb()
    .select({ id: announcements.id })
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1);
  const [poll] = await getDb()
    .select({ questionsJson: announcementPolls.questionsJson })
    .from(announcementPolls)
    .where(eq(announcementPolls.announcementId, announcementId))
    .limit(1);
  if (!announcement || !poll) {
    return Response.json(
      { error: "Announcement questionnaire not found." },
      { status: 404 },
    );
  }
  const questions = parsePollQuestions(poll.questionsJson);
  const optionExists = questions.some(
    (question) =>
      question.id === questionId &&
      question.options.some((option) => option.id === optionId),
  );
  if (!optionExists) {
    return Response.json(
      { error: "Questionnaire option not found." },
      { status: 400 },
    );
  }

  try {
    const file = validatePrivateImage(form.get("image"));
    const stored = await storePrivateFile({
      file,
      kind: "announcement_poll_option_image",
      category: "announcement",
      ownerEmployeeId: user.employeeId,
      user,
    });
    try {
      await attachStoredFile(
        stored.id,
        "announcement_poll_option",
        `${announcementId}:${questionId}:${optionId}`,
      );
      // An option represents one current image. Remove an older replacement
      // only after the new file is attached so a failed upload never destroys
      // the last working image.
      const previousFiles = await getDb()
        .select({ id: storedFiles.id })
        .from(storedFiles)
        .where(
          and(
            eq(storedFiles.kind, "announcement_poll_option_image"),
            eq(storedFiles.relatedEntityType, "announcement_poll_option"),
            eq(
              storedFiles.relatedEntityId,
              `${announcementId}:${questionId}:${optionId}`,
            ),
          ),
        );
      await Promise.all(
        previousFiles
          .filter((file) => file.id !== stored.id)
          .map((file) => deleteStoredFile(file.id, user)),
      );
    } catch (error) {
      await deleteStoredFile(stored.id, user);
      throw error;
    }
    await getDb()
      .insert(auditEvents)
      .values({
        actorEmail: user.email,
        action: "announcement.poll_option_image_uploaded",
        entityType: "announcement",
        entityId: String(announcementId),
        details: `${questionId}:${optionId}:${stored.originalName}`,
      });
    return Response.json(
      {
        imageUrl: `/api/files/${stored.id}?preview=1`,
        fileId: stored.id,
        originalName: stored.originalName,
      },
      { status: 201 },
    );
  } catch (error) {
    return applicationErrorResponse(error);
  }
}
