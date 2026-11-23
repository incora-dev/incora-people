import { and, eq, ne } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { employeeProfileRecords, storedFiles } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  createProfileRecordSchema,
  updateProfileRecordSchema,
} from "@/modules/people/contracts";
import { employeeExists } from "@/modules/people/queries";
import { parseJsonRequest } from "@/modules/shared/http";
import { assertTechnologyReferences } from "@/modules/people/reference-data";
import {
  attachStoredFile,
  deleteStoredFile,
  storePrivateFile,
  validatePrivateFile,
} from "@/modules/files/storage";
import { applicationErrorResponse } from "@/modules/shared/application-error";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).managePeople)
    return Response.json(
      { error: "HR administrator access required." },
      { status: 403 },
    );
  const employeeId = Number((await params).id);
  if (!Number.isInteger(employeeId) || !(await employeeExists(employeeId)))
    return Response.json({ error: "Employee not found." }, { status: 404 });
  let input;
  let attachment: File | null = null;
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    const parsed = createProfileRecordSchema.safeParse(
      Object.fromEntries(form.entries()),
    );
    if (!parsed.success) {
      return Response.json(
        { error: "Check the certificate details." },
        { status: 400 },
      );
    }
    input = parsed.data;
    const fileValue = form.get("file");
    if (fileValue instanceof File && fileValue.size > 0) {
      try {
        attachment = validatePrivateFile(fileValue);
      } catch (error) {
        return applicationErrorResponse(error);
      }
    }
  } else {
    const parsed = await parseJsonRequest(request, createProfileRecordSchema);
    if (!parsed.ok) return parsed.response;
    input = parsed.data;
  }
  if (input.kind === "compensation") {
    return Response.json(
      { error: "Create compensation history from the Compensation section." },
      { status: 409 },
    );
  }
  if (
    attachment &&
    !["skill", "education", "certification"].includes(input.kind)
  ) {
    return Response.json(
      { error: "Attachments are not supported for this profile record." },
      { status: 400 },
    );
  }
  let technology: { id: number; label: string } | undefined;
  try {
    [technology] =
      input.kind === "skill"
        ? await assertTechnologyReferences([input.title])
        : [];
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid profile data.",
      },
      { status: 400 },
    );
  }
  if (technology) {
    const [existing] = await getDb()
      .select({ id: employeeProfileRecords.id })
      .from(employeeProfileRecords)
      .where(
        and(
          eq(employeeProfileRecords.employeeId, employeeId),
          eq(employeeProfileRecords.kind, "skill"),
          eq(employeeProfileRecords.referenceValueId, technology.id),
        ),
      )
      .limit(1);
    if (existing) {
      return Response.json(
        { error: "This technology is already assigned." },
        { status: 409 },
      );
    }
  }
  const [record] = await getDb()
    .insert(employeeProfileRecords)
    .values({
      employeeId,
      kind: input.kind,
      referenceValueId: technology?.id ?? null,
      title: input.title,
      subtitle: input.subtitle,
      startedOn: input.startedOn || null,
      endedOn: input.endedOn || null,
      notes: input.notes,
      amountCents: null,
      currency: null,
    })
    .returning();
  let storedAttachment: Awaited<ReturnType<typeof storePrivateFile>> | null =
    null;
  if (attachment) {
    try {
      storedAttachment = await storePrivateFile({
        file: attachment,
        kind: "certificate_attachment",
        category: "certification",
        ownerEmployeeId: employeeId,
        user,
        visibility: "employee_hr",
      });
      await attachStoredFile(
        storedAttachment.id,
        "employee_profile_record",
        String(record.id),
      );
    } catch (error) {
      if (storedAttachment) await deleteStoredFile(storedAttachment.id, user);
      await getDb()
        .delete(employeeProfileRecords)
        .where(eq(employeeProfileRecords.id, record.id));
      return applicationErrorResponse(error);
    }
  }
  try {
    const d1 = getD1();
    await d1.batch([
      d1
        .prepare(
          "INSERT INTO audit_events (actor_email, action, entity_type, entity_id, details) SELECT ?, 'employee.profile_record_created', 'employee', ?, ? WHERE EXISTS (SELECT 1 FROM employee_profile_records WHERE id=?)",
        )
        .bind(
          user.email,
          String(employeeId),
          `${input.kind}: ${input.title}`,
          record.id,
        ),
    ]);
  } catch (error) {
    if (storedAttachment)
      await deleteStoredFile(storedAttachment.id, user).catch(() => {});
    await getDb()
      .delete(employeeProfileRecords)
      .where(eq(employeeProfileRecords.id, record.id))
      .catch(() => {});
    return applicationErrorResponse(error);
  }
  return Response.json(
    {
      record: {
        id: record.id,
        employeeId: record.employeeId,
        kind: record.kind,
        referenceValueId: record.referenceValueId,
        title: record.title,
        subtitle: record.subtitle,
        startedOn: record.startedOn,
        endedOn: record.endedOn,
        notes: record.notes,
        createdAt: record.createdAt,
        attachmentFileId: storedAttachment?.id ?? null,
        attachmentName: storedAttachment?.originalName ?? null,
      },
    },
    { status: 201 },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).managePeople)
    return Response.json(
      { error: "HR administrator access required." },
      { status: 403 },
    );
  const employeeId = Number((await params).id);
  const recordId = Number(new URL(request.url).searchParams.get("recordId"));
  if (
    !Number.isInteger(employeeId) ||
    employeeId <= 0 ||
    !Number.isInteger(recordId) ||
    recordId <= 0
  )
    return Response.json({ error: "Invalid profile record." }, { status: 400 });
  const [record] = await getDb()
    .select({
      kind: employeeProfileRecords.kind,
      title: employeeProfileRecords.title,
    })
    .from(employeeProfileRecords)
    .where(
      and(
        eq(employeeProfileRecords.id, recordId),
        eq(employeeProfileRecords.employeeId, employeeId),
      ),
    )
    .limit(1);
  if (!record)
    return Response.json({ error: "Record not found." }, { status: 404 });
  const [attachment] = await getDb()
    .select({ id: storedFiles.id })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.relatedEntityType, "employee_profile_record"),
        eq(storedFiles.relatedEntityId, String(recordId)),
      ),
    )
    .limit(1);
  const d1 = getD1();
  const [deleteResult] = await d1.batch([
    d1
      .prepare(
        "DELETE FROM employee_profile_records WHERE id=? AND employee_id=? RETURNING id",
      )
      .bind(recordId, employeeId),
    d1
      .prepare(
        "INSERT INTO audit_events (actor_email, action, entity_type, entity_id, details) SELECT ?, 'employee.profile_record_deleted', 'employee', ?, ? WHERE changes() > 0",
      )
      .bind(user.email, String(employeeId), `${record.kind}: ${record.title}`),
  ]);
  if (!deleteResult?.results?.length)
    return Response.json({ error: "Record not found." }, { status: 404 });
  if (attachment) await deleteStoredFile(attachment.id, user);
  return Response.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).managePeople)
    return Response.json(
      { error: "HR administrator access required." },
      { status: 403 },
    );
  const employeeId = Number((await params).id);
  let input;
  let attachment: File | null = null;
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    const parsed = updateProfileRecordSchema.safeParse(
      Object.fromEntries(form.entries()),
    );
    if (!parsed.success)
      return Response.json(
        { error: "Check the profile record details." },
        { status: 400 },
      );
    input = parsed.data;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      try {
        attachment = validatePrivateFile(file);
      } catch (error) {
        return applicationErrorResponse(error);
      }
    }
  } else {
    const parsed = await parseJsonRequest(request, updateProfileRecordSchema);
    if (!parsed.ok) return parsed.response;
    input = parsed.data;
  }
  const db = getDb();
  const [current] = await db
    .select()
    .from(employeeProfileRecords)
    .where(
      and(
        eq(employeeProfileRecords.id, input.recordId),
        eq(employeeProfileRecords.employeeId, employeeId),
      ),
    )
    .limit(1);
  if (!current)
    return Response.json({ error: "Record not found." }, { status: 404 });
  if (current.kind !== input.kind)
    return Response.json(
      { error: "The record type cannot be changed." },
      { status: 400 },
    );
  if (input.kind === "compensation")
    return Response.json(
      { error: "Legacy compensation records are read-only." },
      { status: 409 },
    );
  if (
    attachment &&
    !["skill", "education", "certification"].includes(input.kind)
  )
    return Response.json(
      { error: "Attachments are not supported for this profile record." },
      { status: 400 },
    );
  let technology: { id: number; label: string } | undefined;
  try {
    [technology] =
      input.kind === "skill"
        ? await assertTechnologyReferences([input.title])
        : [];
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid record." },
      { status: 400 },
    );
  }
  if (technology) {
    const [duplicate] = await db
      .select({ id: employeeProfileRecords.id })
      .from(employeeProfileRecords)
      .where(
        and(
          eq(employeeProfileRecords.employeeId, employeeId),
          eq(employeeProfileRecords.kind, "skill"),
          eq(employeeProfileRecords.referenceValueId, technology.id),
          ne(employeeProfileRecords.id, input.recordId),
        ),
      )
      .limit(1);
    if (duplicate)
      return Response.json(
        { error: "This technology is already assigned." },
        { status: 409 },
      );
  }
  const priorAttachments = await db
    .select({ id: storedFiles.id })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.relatedEntityType, "employee_profile_record"),
        eq(storedFiles.relatedEntityId, String(input.recordId)),
      ),
    );
  let replacement: Awaited<ReturnType<typeof storePrivateFile>> | null = null;
  try {
    if (attachment) {
      replacement = await storePrivateFile({
        file: attachment,
        kind: "certificate_attachment",
        category: "certification",
        ownerEmployeeId: employeeId,
        user,
        visibility: "employee_hr",
      });
      await attachStoredFile(
        replacement.id,
        "employee_profile_record",
        String(input.recordId),
      );
    }
    const nextRecord = {
      referenceValueId: technology?.id ?? current.referenceValueId,
      title: technology?.label ?? input.title,
      subtitle: input.subtitle,
      startedOn: input.startedOn || null,
      endedOn: input.endedOn || null,
      notes: input.notes,
    };
    const d1 = getD1();
    const [updateResult] = await d1.batch([
      d1
        .prepare(
          "UPDATE employee_profile_records SET reference_value_id=?, title=?, subtitle=?, started_on=?, ended_on=?, notes=? WHERE id=? AND employee_id=? AND kind=? AND reference_value_id IS ? AND title IS ? AND subtitle IS ? AND started_on IS ? AND ended_on IS ? AND notes IS ? RETURNING id",
        )
        .bind(
          nextRecord.referenceValueId,
          nextRecord.title,
          nextRecord.subtitle,
          nextRecord.startedOn,
          nextRecord.endedOn,
          nextRecord.notes,
          input.recordId,
          employeeId,
          input.kind,
          current.referenceValueId,
          current.title,
          current.subtitle,
          current.startedOn,
          current.endedOn,
          current.notes,
        ),
      d1
        .prepare(
          "INSERT INTO audit_events (actor_email, action, entity_type, entity_id, details) SELECT ?, 'employee.profile_record_updated', 'employee', ?, ? WHERE changes() > 0",
        )
        .bind(
          user.email,
          String(employeeId),
          `${input.kind}: ${nextRecord.title}`,
        ),
    ]);
    if (!updateResult?.results?.length) {
      if (replacement)
        await deleteStoredFile(replacement.id, user).catch(() => {});
      return Response.json(
        { error: "This record changed; reload it and try again." },
        { status: 409 },
      );
    }
    const [record] = await db
      .select()
      .from(employeeProfileRecords)
      .where(eq(employeeProfileRecords.id, input.recordId))
      .limit(1);
    if (!record) throw new Error("Profile record disappeared during update.");
    if (replacement) {
      for (const oldFile of priorAttachments)
        await deleteStoredFile(oldFile.id, user);
    }
    const [storedAttachment] = replacement
      ? [replacement]
      : priorAttachments.length
        ? await db
            .select({
              id: storedFiles.id,
              originalName: storedFiles.originalName,
            })
            .from(storedFiles)
            .where(eq(storedFiles.id, priorAttachments[0].id))
            .limit(1)
        : [];
    return Response.json({
      record: {
        id: record.id,
        employeeId: record.employeeId,
        kind: record.kind,
        referenceValueId: record.referenceValueId,
        title: record.title,
        subtitle: record.subtitle,
        startedOn: record.startedOn,
        endedOn: record.endedOn,
        notes: record.notes,
        createdAt: record.createdAt,
        attachmentFileId: storedAttachment?.id ?? null,
        attachmentName: storedAttachment?.originalName ?? null,
      },
    });
  } catch (error) {
    if (replacement)
      await deleteStoredFile(replacement.id, user).catch(() => {});
    return applicationErrorResponse(error);
  }
}
