import { getDb } from "@/db";
import { and, eq } from "drizzle-orm";
import { auditEvents, employeeDocumentFolders, storedFiles } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  employeeDocumentFolderSchema,
  employeeDocumentUploadSchema,
  moveEmployeeDocumentSchema,
} from "@/modules/files/contracts";
import {
  deleteStoredFile,
  storePrivateFile,
  validatePrivateFile,
} from "@/modules/files/storage";
import { getEmployee } from "@/modules/people/queries";
import { applicationErrorResponse } from "@/modules/shared/application-error";
import { isUniqueConstraintError } from "@/modules/shared/database-errors";
import { parseJsonRequest } from "@/modules/shared/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId)) {
    return Response.json({ error: "Invalid employee." }, { status: 400 });
  }
  if (!access.managePeople && user.employeeId !== employeeId) {
    return Response.json(
      { error: "You may upload documents to your own profile only." },
      { status: 403 },
    );
  }
  if (!(await getEmployee(employeeId))) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }

  try {
    const form = await request.formData();
    const parsed = employeeDocumentUploadSchema.safeParse({
      category: form.get("category"),
      folderId: form.get("folderId"),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "Choose a valid document category." },
        { status: 400 },
      );
    }
    const file = validatePrivateFile(form.get("file"));
    const [folder] = await getDb()
      .select()
      .from(employeeDocumentFolders)
      .where(
        and(
          eq(employeeDocumentFolders.id, parsed.data.folderId),
          eq(employeeDocumentFolders.employeeId, employeeId),
        ),
      )
      .limit(1);
    if (!folder) {
      return Response.json(
        { error: "Document folder not found." },
        { status: 404 },
      );
    }
    if (!access.managePeople && folder.visibility === "hr_only") {
      return Response.json(
        { error: "This folder is restricted to HR." },
        { status: 403 },
      );
    }
    const stored = await storePrivateFile({
      file,
      kind: "employee_document",
      category: parsed.data.category,
      ownerEmployeeId: employeeId,
      user,
      folderId: folder.id,
      visibility: folder.visibility as "employee_hr" | "hr_only",
    });
    try {
      await getDb()
        .insert(auditEvents)
        .values({
          actorEmail: user.email,
          action: "employee.document_uploaded",
          entityType: "employee",
          entityId: String(employeeId),
          details: `${parsed.data.category}: ${stored.originalName}`,
        });
    } catch (error) {
      await deleteStoredFile(stored.id, user);
      throw error;
    }
    return Response.json({ file: stored }, { status: 201 });
  } catch (error) {
    return applicationErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
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
  const employeeId = Number((await params).id);
  if (!Number.isInteger(employeeId) || !(await getEmployee(employeeId))) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }
  const parsed = await parseJsonRequest(request, employeeDocumentFolderSchema);
  if (!parsed.ok) return parsed.response;
  let folder;
  try {
    [folder] = await getDb()
      .insert(employeeDocumentFolders)
      .values({
        employeeId,
        name: parsed.data.name,
        visibility: parsed.data.visibility,
        createdByEmail: user.email,
      })
      .returning();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return Response.json(
        { error: "A folder with this name already exists." },
        { status: 409 },
      );
    }
    throw error;
  }
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "employee.document_folder_created",
      entityType: "employee",
      entityId: String(employeeId),
      details: `${folder.name}: ${folder.visibility}`,
    });
  return Response.json({ folder }, { status: 201 });
}

export async function PATCH(
  request: Request,
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
  const employeeId = Number((await params).id);
  if (!Number.isInteger(employeeId)) {
    return Response.json({ error: "Invalid employee." }, { status: 400 });
  }
  const parsed = await parseJsonRequest(request, moveEmployeeDocumentSchema);
  if (!parsed.ok) return parsed.response;
  const [[folder], [file]] = await Promise.all([
    getDb()
      .select()
      .from(employeeDocumentFolders)
      .where(
        and(
          eq(employeeDocumentFolders.id, parsed.data.folderId),
          eq(employeeDocumentFolders.employeeId, employeeId),
        ),
      )
      .limit(1),
    getDb()
      .select()
      .from(storedFiles)
      .where(
        and(
          eq(storedFiles.id, parsed.data.fileId),
          eq(storedFiles.ownerEmployeeId, employeeId),
          eq(storedFiles.kind, "employee_document"),
        ),
      )
      .limit(1),
  ]);
  if (!folder || !file) {
    return Response.json(
      { error: "Document or folder not found." },
      { status: 404 },
    );
  }
  const [updated] = await getDb()
    .update(storedFiles)
    .set({ folderId: folder.id, visibility: folder.visibility })
    .where(eq(storedFiles.id, file.id))
    .returning();
  await getDb().insert(auditEvents).values({
    actorEmail: user.email,
    action: "employee.document_moved",
    entityType: "stored_file",
    entityId: file.id,
    details: folder.name,
  });
  return Response.json({ file: updated });
}
