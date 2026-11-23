import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments, documentFolders, storedFiles } from "@/db/schema";
export async function getCompanyDocuments() {
  const db = getDb();
  const folders = await db
    .select()
    .from(documentFolders)
    .orderBy(asc(documentFolders.sortOrder), asc(documentFolders.name));
  const documents = await db
    .select({
      id: companyDocuments.id,
      folderId: companyDocuments.folderId,
      title: companyDocuments.title,
      fileId: storedFiles.id,
      originalName: storedFiles.originalName,
      contentType: storedFiles.contentType,
      sizeBytes: storedFiles.sizeBytes,
      createdAt: companyDocuments.createdAt,
    })
    .from(companyDocuments)
    .innerJoin(storedFiles, eq(companyDocuments.fileId, storedFiles.id));
  return { folders, documents };
}
