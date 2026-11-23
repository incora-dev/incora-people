import { getDb } from "@/db";
import {
  announcementDeliveries,
  announcementPolls,
  announcements,
  auditEvents,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
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
import {
  ApplicationError,
  applicationErrorResponse,
} from "@/modules/shared/application-error";
import {
  attachStoredFile,
  deleteStoredFile,
  storePrivateFile,
  validatePrivateImage,
} from "@/modules/files/storage";

type ParsedAnnouncement =
  | { ok: true; data: z.infer<typeof announcementSchema> }
  | { ok: false; response: Response };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings) {
    return Response.json(
      { error: "Admin settings access required." },
      { status: 403 },
    );
  }
  const isMultipart = request.headers
    .get("content-type")
    ?.toLowerCase()
    .startsWith("multipart/form-data");
  let parsed: ParsedAnnouncement;
  let image: File | null = null;
  if (isMultipart) {
    const form = await request.formData();
    const formResult = announcementSchema.safeParse({
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      publishedAt: String(form.get("publishedAt") ?? ""),
      expiresAt: String(form.get("expiresAt") ?? ""),
      pinned: ["on", "true", "1"].includes(String(form.get("pinned") ?? "")),
      pollQuestions: String(form.get("pollQuestions") ?? "[]"),
    });
    parsed = formResult.success
      ? { ok: true, data: formResult.data }
      : {
          ok: false,
          response: Response.json(
            { error: "Check the submitted fields." },
            { status: 400 },
          ),
        };
    const upload = form.get("image");
    image = upload instanceof File && upload.size > 0 ? upload : null;
  } else {
    parsed = await parseJsonRequest(request, announcementSchema);
  }
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
  let storedImage: Awaited<ReturnType<typeof storePrivateFile>> | null = null;
  let announcement: typeof announcements.$inferSelect | null = null;
  let poll: typeof announcementPolls.$inferSelect | null = null;
  try {
    if (image) {
      if (!user.employeeId) {
        return Response.json(
          { error: "Employee account required." },
          { status: 400 },
        );
      }
      storedImage = await storePrivateFile({
        file: validatePrivateImage(image),
        kind: "announcement_image",
        category: "announcement",
        ownerEmployeeId: user.employeeId,
        user,
      });
    }
    const [createdAnnouncement] = await db
      .insert(announcements)
      .values({
        ...announcementData,
        body: sanitizeAnnouncementHtml(announcementData.body),
        imageFileId: storedImage?.id ?? null,
        publishedAt,
        expiresAt,
        active: image ? false : true,
        createdByEmail: user.email,
      })
      .returning();
    announcement = createdAnnouncement;
    if (storedImage && announcement) {
      await attachStoredFile(
        storedImage.id,
        "announcement",
        String(announcement.id),
      );
    }
    if (questions.value.length && announcement) {
      [poll] = await db
        .insert(announcementPolls)
        .values({
          announcementId: announcement.id,
          question: announcement.title,
          optionsJson: "[]",
          questionsJson: JSON.stringify(questions.value),
        })
        .returning();
    }
    if (!announcement) throw new Error("Announcement was not created.");
    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "create",
      entityType: "announcement",
      entityId: String(announcement.id),
      details: announcement.title,
    });
    if (image) {
      const [published] = await db
        .update(announcements)
        .set({ active: true })
        .where(eq(announcements.id, announcement.id))
        .returning();
      announcement = published;
    }
    await enqueueAnnouncementDelivery(
      announcement.id,
      announcement.publishedAt,
    );
    if (new Date(announcement.publishedAt).getTime() <= Date.now())
      await processAnnouncementDeliveries(
        new URL(request.url).origin,
        announcement.id,
      );
  } catch (error) {
    if (announcement?.id && image) {
      await db
        .update(announcements)
        .set({ active: false })
        .where(eq(announcements.id, announcement.id))
        .catch(() => undefined);
    }
    if (storedImage) {
      await deleteStoredFile(storedImage.id, user).catch(() => undefined);
    }
    if (error instanceof ApplicationError) {
      return applicationErrorResponse(error);
    }
    throw error;
  }
  if (!announcement) {
    return Response.json(
      { error: "Announcement was not created." },
      { status: 500 },
    );
  }
  const deliveries = await db
    .select()
    .from(announcementDeliveries)
    .where(eq(announcementDeliveries.announcementId, announcement.id));
  return Response.json(
    {
      announcement: {
        ...announcement,
        poll: poll
          ? { ...poll, title: poll.question, questions: questions.value }
          : null,
        deliveries,
      },
    },
    { status: 201 },
  );
}
