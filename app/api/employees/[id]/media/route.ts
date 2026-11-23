import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, storedFiles } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  deleteStoredFile,
  storePrivateFile,
  validatePrivateImage,
  validateSquareProfileImage,
} from "@/modules/files/storage";
import { getEmployee } from "@/modules/people/queries";
import { applicationErrorResponse } from "@/modules/shared/application-error";

const mediaKinds = ["profile_photo", "profile_cover"] as const;
type MediaKind = (typeof mediaKinds)[number];

function parseKind(value: FormDataEntryValue | string | null) {
  return typeof value === "string" && mediaKinds.includes(value as MediaKind)
    ? (value as MediaKind)
    : null;
}

async function authorize(employeeId: number) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  return {
    user,
    allowed: access.managePeople || user.employeeId === employeeId,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const employeeId = Number((await params).id);
  if (!Number.isInteger(employeeId)) {
    return Response.json({ error: "Invalid employee." }, { status: 400 });
  }
  const authorization = await authorize(employeeId);
  if (!authorization.allowed) {
    return Response.json(
      { error: "You may update your own profile media only." },
      { status: 403 },
    );
  }
  if (!(await getEmployee(employeeId))) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }

  try {
    const form = await request.formData();
    const kind = parseKind(form.get("kind"));
    if (!kind) {
      return Response.json({ error: "Invalid media kind." }, { status: 400 });
    }
    const selectedFile = validatePrivateImage(form.get("file"));
    const file =
      kind === "profile_photo"
        ? await validateSquareProfileImage(selectedFile)
        : selectedFile;
    const previous = await getDb()
      .select({ id: storedFiles.id })
      .from(storedFiles)
      .where(
        and(
          eq(storedFiles.ownerEmployeeId, employeeId),
          eq(storedFiles.kind, kind),
        ),
      )
      .orderBy(desc(storedFiles.createdAt));
    const stored = await storePrivateFile({
      file,
      kind,
      category: "profile",
      ownerEmployeeId: employeeId,
      user: authorization.user,
    });
    await Promise.all(
      previous.map(({ id }) => deleteStoredFile(id, authorization.user)),
    );
    await getDb()
      .insert(auditEvents)
      .values({
        actorEmail: authorization.user.email,
        action: `employee.${kind}_updated`,
        entityType: "employee",
        entityId: String(employeeId),
        details: stored.originalName,
      });
    return Response.json({ file: stored }, { status: 201 });
  } catch (error) {
    return applicationErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const employeeId = Number((await params).id);
  if (!Number.isInteger(employeeId)) {
    return Response.json({ error: "Invalid employee." }, { status: 400 });
  }
  const authorization = await authorize(employeeId);
  if (!authorization.allowed) {
    return Response.json(
      { error: "You may update your own profile media only." },
      { status: 403 },
    );
  }
  const kind = parseKind(new URL(request.url).searchParams.get("kind"));
  if (!kind) {
    return Response.json({ error: "Invalid media kind." }, { status: 400 });
  }
  const files = await getDb()
    .select({ id: storedFiles.id })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.ownerEmployeeId, employeeId),
        eq(storedFiles.kind, kind),
      ),
    );
  await Promise.all(
    files.map(({ id }) => deleteStoredFile(id, authorization.user)),
  );
  return Response.json({ deleted: files.length });
}
