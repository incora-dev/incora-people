import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { announcements, auditEvents } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  attachStoredFile,
  deleteStoredFile,
  storePrivateFile,
  validatePrivateImage,
} from "@/modules/files/storage";
import { applicationErrorResponse } from "@/modules/shared/application-error";

async function getContext(rawId: string) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const id = Number(rawId);
  if (!access.manageSettings) {
    return {
      response: Response.json(
        { error: "Admin settings access required." },
        { status: 403 },
      ),
    } as const;
  }
  if (!user.employeeId) {
    return {
      response: Response.json(
        { error: "Employee account required." },
        { status: 400 },
      ),
    } as const;
  }
  if (!Number.isInteger(id) || id <= 0) {
    return {
      response: Response.json(
        { error: "Invalid announcement id." },
        { status: 400 },
      ),
    } as const;
  }
  const [announcement] = await getDb()
    .select()
    .from(announcements)
    .where(eq(announcements.id, id))
    .limit(1);
  if (!announcement) {
    return {
      response: Response.json(
        { error: "Announcement not found." },
        { status: 404 },
      ),
    } as const;
  }
  return { user, id, announcement } as const;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getContext((await params).id);
  if ("response" in context) return context.response;
  let stored: Awaited<ReturnType<typeof storePrivateFile>> | null = null;
  let announcement: typeof context.announcement | undefined;
  try {
    const file = validatePrivateImage((await request.formData()).get("image"));
    stored = await storePrivateFile({
      file,
      kind: "announcement_image",
      category: "announcement",
      ownerEmployeeId: context.user.employeeId!,
      user: context.user,
    });
    await attachStoredFile(stored.id, "announcement", String(context.id));
    [announcement] = await getDb()
      .update(announcements)
      .set({ imageFileId: stored.id })
      .where(eq(announcements.id, context.id))
      .returning();
    if (!announcement) throw new Error("Announcement update was not saved.");
  } catch (error) {
    if (stored)
      await deleteStoredFile(stored.id, context.user).catch(() => undefined);
    return applicationErrorResponse(error);
  }
  if (context.announcement.imageFileId) {
    await deleteStoredFile(
      context.announcement.imageFileId,
      context.user,
    ).catch(() => undefined);
  }
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: context.user.email,
      action: "announcement.image_updated",
      entityType: "announcement",
      entityId: String(context.id),
      details: stored.originalName,
    });
  return Response.json({
    announcement,
    image: {
      id: stored.id,
      url: `/api/files/${stored.id}?preview=1`,
      originalName: stored.originalName,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getContext((await params).id);
  if ("response" in context) return context.response;
  if (!context.announcement.imageFileId) return Response.json({ ok: true });
  await getDb()
    .update(announcements)
    .set({ imageFileId: null })
    .where(eq(announcements.id, context.id));
  await deleteStoredFile(context.announcement.imageFileId, context.user);
  return Response.json({ ok: true });
}
