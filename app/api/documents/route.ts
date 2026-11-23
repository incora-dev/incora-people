import { getDb } from "@/db";
import { eq } from "drizzle-orm";
import { auditEvents, companyDocuments, documentFolders } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { createFolderSchema } from "@/modules/documents/contracts";
import {
  deleteStoredFile,
  storePrivateFile,
  validatePrivateFile,
} from "@/modules/files/storage";
import { parseJsonRequest } from "@/modules/shared/http";
export async function POST(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.managePeople)
    return Response.json(
      { error: "People administration access required." },
      { status: 403 },
    );
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    if (!user.employeeId)
      return Response.json(
        { error: "Employee account required." },
        { status: 400 },
      );
    const form = await request.formData();
    const folderId = Number(form.get("folderId"));
    if (!Number.isInteger(folderId))
      return Response.json({ error: "Choose a folder." }, { status: 400 });
    const file = validatePrivateFile(form.get("file"));
    const stored = await storePrivateFile({
      file,
      kind: "company_document",
      category: "company",
      ownerEmployeeId: user.employeeId,
      user,
    });
    let document;
    try {
      [document] = await getDb()
        .insert(companyDocuments)
        .values({
          folderId,
          fileId: stored.id,
          title: String(form.get("title") || stored.originalName).slice(0, 160),
        })
        .returning();
      await getDb()
        .insert(auditEvents)
        .values({
          actorEmail: user.email,
          action: "company_document.uploaded",
          entityType: "company_document",
          entityId: String(document.id),
          details: stored.originalName,
        });
    } catch (error) {
      await getDb()
        .delete(companyDocuments)
        .where(eq(companyDocuments.fileId, stored.id));
      await deleteStoredFile(stored.id, user);
      throw error;
    }
    return Response.json(
      {
        document: {
          ...document,
          fileId: stored.id,
          originalName: stored.originalName,
          sizeBytes: stored.sizeBytes,
        },
      },
      { status: 201 },
    );
  }
  const parsed = await parseJsonRequest(request, createFolderSchema);
  if (!parsed.ok) return parsed.response;
  const [folder] = await getDb()
    .insert(documentFolders)
    .values(parsed.data)
    .returning();
  return Response.json({ folder }, { status: 201 });
}
