import { env } from "cloudflare:workers";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, employeeDocumentFolders, storedFiles } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { ApplicationError } from "@/modules/shared/application-error";
import { readImageDimensions } from "@/modules/files/image-metadata";
import { storedFileDeletionAuditDetails } from "@/modules/files/audit";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type FileKind =
  | "employee_document"
  | "reimbursement_receipt"
  | "bug_screenshot"
  | "profile_photo"
  | "profile_cover"
  | "company_document"
  | "knowledge_attachment"
  | "certificate_attachment"
  | "compensation_attachment"
  | "announcement_image"
  | "announcement_poll_option_image";

type FilesEnv = {
  FILES?: R2Bucket;
};

export function getFilesBucket() {
  const bucket = (env as unknown as FilesEnv).FILES;
  if (!bucket) {
    throw new ApplicationError(
      "Private file storage is not configured.",
      500,
      "file_storage_unavailable",
    );
  }
  return bucket;
}

export function validatePrivateFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) {
    throw new ApplicationError(
      "Choose a receipt or document file.",
      400,
      "file_required",
    );
  }
  if (value.size > MAX_FILE_SIZE) {
    throw new ApplicationError(
      "The maximum file size is 10 MB.",
      400,
      "file_too_large",
    );
  }
  if (!ACCEPTED_CONTENT_TYPES.has(value.type)) {
    throw new ApplicationError(
      "Upload a PDF, DOCX, JPEG, PNG or WebP file.",
      400,
      "file_type_not_allowed",
    );
  }
  return value;
}

export function validatePrivateImage(value: FormDataEntryValue | null) {
  const file = validatePrivateFile(value);
  if (!file.type.startsWith("image/")) {
    throw new ApplicationError(
      "Upload a JPEG, PNG or WebP image.",
      400,
      "image_type_not_allowed",
    );
  }
  return file;
}

export async function validateSquareProfileImage(file: File) {
  const dimensions = readImageDimensions(
    new Uint8Array(await file.arrayBuffer()),
  );
  if (!dimensions) {
    throw new ApplicationError(
      "Upload a valid JPEG, PNG or WebP image.",
      400,
      "invalid_image_content",
    );
  }
  if (dimensions.width !== dimensions.height) {
    throw new ApplicationError(
      "Profile photos must be square.",
      400,
      "profile_photo_not_square",
    );
  }
  return file;
}

export async function storePrivateFile({
  file,
  kind,
  category,
  ownerEmployeeId,
  user,
  folderId,
  visibility = "employee_hr",
}: {
  file: File;
  kind: FileKind;
  category: string;
  ownerEmployeeId: number;
  user: CurrentUser;
  folderId?: number | null;
  visibility?: "employee_hr" | "hr_only";
}) {
  const id = crypto.randomUUID();
  const extension = safeExtension(file.name);
  const objectKey = `${kind}/${ownerEmployeeId}/${id}${extension}`;
  const bucket = getFilesBucket();

  await bucket.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      ownerEmployeeId: String(ownerEmployeeId),
      uploadedByEmail: user.email,
    },
  });

  try {
    const [created] = await getDb()
      .insert(storedFiles)
      .values({
        id,
        kind,
        category,
        ownerEmployeeId,
        objectKey,
        originalName: normalizeFileName(file.name),
        contentType: file.type,
        sizeBytes: file.size,
        uploadedByEmail: user.email,
        folderId: folderId ?? null,
        visibility,
      })
      .returning();
    return created;
  } catch (error) {
    await bucket.delete(objectKey);
    throw error;
  }
}

export async function attachStoredFile(
  id: string,
  relatedEntityType: string,
  relatedEntityId: string,
) {
  await getDb()
    .update(storedFiles)
    .set({ relatedEntityType, relatedEntityId })
    .where(eq(storedFiles.id, id));
}

export type StoredFileDeleteExpectation = {
  kind: "compensation_attachment";
  ownerEmployeeId: number;
  relatedEntityType: "employee_compensation" | null;
  relatedEntityId: string | null;
};

export async function deleteStoredFile(
  id: string,
  actor: CurrentUser,
  expected?: StoredFileDeleteExpectation,
) {
  const conditions = [eq(storedFiles.id, id)];
  if (expected) {
    conditions.push(
      eq(storedFiles.kind, expected.kind),
      eq(storedFiles.ownerEmployeeId, expected.ownerEmployeeId),
      expected.relatedEntityType === null
        ? isNull(storedFiles.relatedEntityType)
        : eq(storedFiles.relatedEntityType, expected.relatedEntityType),
      expected.relatedEntityId === null
        ? isNull(storedFiles.relatedEntityId)
        : eq(storedFiles.relatedEntityId, expected.relatedEntityId),
    );
  }
  const [record] = await getDb()
    .select()
    .from(storedFiles)
    .where(and(...conditions))
    .limit(1);
  if (!record) return;

  await getFilesBucket().delete(record.objectKey);
  await getDb()
    .delete(storedFiles)
    .where(and(...conditions));
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: actor.email,
      action: "file.deleted",
      entityType: "stored_file",
      entityId: id,
      details: storedFileDeletionAuditDetails(record.kind, record.originalName),
    });
}

export async function getEmployeeDocuments(
  employeeId: number,
  includeHrOnly = false,
) {
  return getDb()
    .select({
      id: storedFiles.id,
      category: storedFiles.category,
      originalName: storedFiles.originalName,
      contentType: storedFiles.contentType,
      sizeBytes: storedFiles.sizeBytes,
      uploadedByEmail: storedFiles.uploadedByEmail,
      folderId: storedFiles.folderId,
      visibility: storedFiles.visibility,
      createdAt: storedFiles.createdAt,
    })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.ownerEmployeeId, employeeId),
        eq(storedFiles.kind, "employee_document"),
        sql`(${storedFiles.relatedEntityType} IS NULL OR ${storedFiles.relatedEntityType} <> 'employee_compensation')`,
        includeHrOnly ? sql`1 = 1` : eq(storedFiles.visibility, "employee_hr"),
      ),
    )
    .orderBy(desc(storedFiles.createdAt));
}

export function getEmployeeDocumentFolders(
  employeeId: number,
  includeHrOnly = false,
) {
  return getDb()
    .select()
    .from(employeeDocumentFolders)
    .where(
      and(
        eq(employeeDocumentFolders.employeeId, employeeId),
        includeHrOnly
          ? sql`1 = 1`
          : eq(employeeDocumentFolders.visibility, "employee_hr"),
      ),
    )
    .orderBy(employeeDocumentFolders.name);
}

export async function getEmployeeProfileMedia(employeeId: number) {
  const records = await getDb()
    .select({
      id: storedFiles.id,
      kind: storedFiles.kind,
      originalName: storedFiles.originalName,
      createdAt: storedFiles.createdAt,
    })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.ownerEmployeeId, employeeId),
        sql`${storedFiles.kind} IN ('profile_photo', 'profile_cover')`,
      ),
    )
    .orderBy(desc(storedFiles.createdAt));

  return {
    photo: records.find((record) => record.kind === "profile_photo") ?? null,
    cover: records.find((record) => record.kind === "profile_cover") ?? null,
  };
}

function safeExtension(name: string) {
  const match = name.toLowerCase().match(/\.(pdf|docx|jpe?g|png|webp)$/);
  return match ? match[0].replace(".jpeg", ".jpg") : "";
}

function normalizeFileName(name: string) {
  return name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "file";
}
