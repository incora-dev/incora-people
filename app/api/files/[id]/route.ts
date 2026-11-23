import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  announcements,
  companyDocuments,
  knowledgeArticles,
  storedFiles,
} from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getAuthorizedStoredFile } from "@/modules/files/authorization";
import { deleteStoredFile, getFilesBucket } from "@/modules/files/storage";
import { canManageKnowledgeRole } from "@/modules/knowledge/queries";
import { createFileDownloadHandler } from "@/modules/files/download-handler";

export const GET = createFileDownloadHandler({
  getCurrentUser,
  getAuthorizedFile: getAuthorizedStoredFile,
  getFileObject: async (objectKey) => {
    const object = await getFilesBucket().get(objectKey);
    return object ? { body: object.body } : null;
  },
});

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.managePeople) {
    return Response.json(
      { error: "People administration access required." },
      { status: 403 },
    );
  }
  const { id } = await params;
  const [record] = await getDb()
    .select({
      id: storedFiles.id,
      kind: storedFiles.kind,
      relatedEntityType: storedFiles.relatedEntityType,
      relatedEntityId: storedFiles.relatedEntityId,
    })
    .from(storedFiles)
    .where(eq(storedFiles.id, id))
    .limit(1);
  if (!record) {
    return Response.json({ error: "File not found." }, { status: 404 });
  }
  if (
    record.kind !== "employee_document" &&
    record.kind !== "profile_photo" &&
    record.kind !== "profile_cover" &&
    record.kind !== "company_document" &&
    record.kind !== "knowledge_attachment" &&
    record.kind !== "certificate_attachment" &&
    record.kind !== "announcement_image" &&
    record.kind !== "announcement_poll_option_image"
  ) {
    return Response.json(
      { error: "Receipts are retained with their reimbursement record." },
      { status: 409 },
    );
  }
  if (record.kind === "knowledge_attachment") {
    if (
      record.relatedEntityType !== "knowledge_article" ||
      !record.relatedEntityId
    ) {
      return Response.json(
        { error: "Invalid knowledge attachment." },
        { status: 409 },
      );
    }
    const [article] = await getDb()
      .select({ minimumRole: knowledgeArticles.minimumRole })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.id, Number(record.relatedEntityId)))
      .limit(1);
    if (
      !article ||
      !canManageKnowledgeRole(user, access.managePeople, article.minimumRole)
    ) {
      return Response.json(
        { error: "You cannot change an article above your access level." },
        { status: 403 },
      );
    }
  }
  if (record.kind === "announcement_image") {
    if (!access.manageSettings) {
      return Response.json(
        { error: "Announcement administration access required." },
        { status: 403 },
      );
    }
    await getDb()
      .update(announcements)
      .set({ imageFileId: null })
      .where(eq(announcements.imageFileId, record.id));
  }
  if (
    record.kind === "announcement_poll_option_image" &&
    !access.manageSettings
  ) {
    return Response.json(
      { error: "Announcement administration access required." },
      { status: 403 },
    );
  }
  if (record.kind === "company_document") {
    await getDb()
      .delete(companyDocuments)
      .where(eq(companyDocuments.fileId, record.id));
  }
  await deleteStoredFile(id, user);
  return Response.json({ deleted: true });
}
