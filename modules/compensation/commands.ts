import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { auditEvents, storedFiles } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import type { CompensationUpdateInput } from "@/modules/compensation/contracts";
import {
  mergeCompensationUpdate,
  type CompensationRecordForUpdate,
} from "@/modules/compensation/domain";
import {
  commitBeforeAttachmentCleanup,
  deleteCoreBeforeAttachmentCleanup,
} from "@/modules/compensation/security";
import {
  deleteStoredFile,
  storePrivateFile,
  validatePrivateFile,
} from "@/modules/files/storage";

export async function updateCompensationRecord(
  current: CompensationRecordForUpdate,
  input: CompensationUpdateInput,
  files: File[],
  user: CurrentUser,
) {
  const db = getDb();
  const existingAttachments = await db
    .select({ id: storedFiles.id })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.relatedEntityType, "employee_compensation"),
        eq(storedFiles.relatedEntityId, String(current.id)),
        eq(storedFiles.kind, "compensation_attachment"),
        eq(storedFiles.ownerEmployeeId, current.employeeId),
      ),
    );
  const attachmentIds = new Set(existingAttachments.map(({ id }) => id));
  if (
    new Set(input.removeAttachmentIds).size !==
      input.removeAttachmentIds.length ||
    input.removeAttachmentIds.some((id) => !attachmentIds.has(id))
  ) {
    throw new Error("INVALID_COMPENSATION_ATTACHMENTS");
  }

  const validFiles = files.map((file) => validatePrivateFile(file));
  const storedIds: string[] = [];
  const next = mergeCompensationUpdate(current, input);
  try {
    for (const file of validFiles) {
      const stored = await storePrivateFile({
        file,
        kind: "compensation_attachment",
        category: "contract",
        ownerEmployeeId: current.employeeId,
        user,
        visibility: "hr_only",
      });
      storedIds.push(stored.id);
    }

    const d1 = getD1();
    const statements = [
      d1
        .prepare(
          "UPDATE employee_compensations SET kind=?,label=?,effective_from=?,amount_cents=?,currency=?,period=?,payment_schedule=?,comment=?,updated_at=? WHERE id=? AND employee_id=?",
        )
        .bind(
          next.kind,
          next.label,
          next.effectiveFrom,
          next.amountCents,
          next.currency,
          next.period,
          next.paymentSchedule,
          next.comment,
          new Date().toISOString(),
          current.id,
          current.employeeId,
        ),
      d1
        .prepare(
          "INSERT INTO audit_events (actor_email,action,entity_type,entity_id,details) SELECT ?,'employee.compensation_updated','employee_compensation',?,'Compensation record updated' WHERE changes()>0",
        )
        .bind(user.email, String(current.id)),
      ...storedIds.map((id) =>
        d1
          .prepare(
            "UPDATE stored_files SET related_entity_type='employee_compensation',related_entity_id=? WHERE id=? AND owner_employee_id=? AND kind='compensation_attachment' AND related_entity_type IS NULL AND related_entity_id IS NULL AND changes()>0",
          )
          .bind(String(current.id), id, current.employeeId),
      ),
    ];
    let result: Awaited<ReturnType<typeof d1.batch>> = [];
    const outcome = await commitBeforeAttachmentCleanup(
      input.removeAttachmentIds,
      async () => {
        result = await d1.batch(statements);
        return Boolean(result[0]?.meta?.changes);
      },
      (id) => deleteCompensationAttachment(id, current, user),
    );
    if (!outcome.committed) {
      await cleanupUnattachedFiles(storedIds, current, user);
      return false;
    }

    let cleanupFailures = outcome.failedIds.length;
    for (const id of outcome.failedIds)
      await recordAttachmentCleanupFailure(id, user);
    for (const [index, id] of storedIds.entries()) {
      if (result[index + 2]?.meta?.changes) continue;
      if (await cleanupUnattachedFile(id, current, user)) cleanupFailures++;
    }
    return { updated: true as const, cleanupFailures };
  } catch (error) {
    await cleanupUnattachedFiles(storedIds, current, user);
    throw error;
  }
}

export async function deleteCompensationRecord(
  current: CompensationRecordForUpdate,
  user: CurrentUser,
) {
  const files = await getDb()
    .select({ id: storedFiles.id })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.kind, "compensation_attachment"),
        eq(storedFiles.ownerEmployeeId, current.employeeId),
        eq(storedFiles.relatedEntityType, "employee_compensation"),
        eq(storedFiles.relatedEntityId, String(current.id)),
      ),
    );

  const d1 = getD1();
  const outcome = await deleteCoreBeforeAttachmentCleanup(
    files.map(({ id }) => id),
    async () => {
      const result = await d1.batch([
        d1
          .prepare(
            "DELETE FROM employee_compensations WHERE id=? AND employee_id=?",
          )
          .bind(current.id, current.employeeId),
        d1
          .prepare(
            "INSERT INTO audit_events (actor_email,action,entity_type,entity_id,details) SELECT ?,'employee.compensation_deleted','employee_compensation',?,'Compensation record deleted' WHERE changes()>0",
          )
          .bind(user.email, String(current.id)),
      ]);
      return Boolean(result[0]?.meta?.changes);
    },
    (id) => deleteCompensationAttachment(id, current, user),
  );
  if (!outcome.deleted) return false;
  for (const id of outcome.failedIds)
    await recordAttachmentCleanupFailure(id, user);
  return {
    deleted: true as const,
    cleanupFailures: outcome.failedIds.length,
  };
}

async function deleteCompensationAttachment(
  id: string,
  current: CompensationRecordForUpdate,
  user: CurrentUser,
) {
  await deleteStoredFile(id, user, {
    kind: "compensation_attachment",
    ownerEmployeeId: current.employeeId,
    relatedEntityType: "employee_compensation",
    relatedEntityId: String(current.id),
  });
}

async function cleanupUnattachedFile(
  id: string,
  current: CompensationRecordForUpdate,
  user: CurrentUser,
) {
  try {
    await deleteStoredFile(id, user, {
      kind: "compensation_attachment",
      ownerEmployeeId: current.employeeId,
      relatedEntityType: null,
      relatedEntityId: null,
    });
    return false;
  } catch {
    await recordAttachmentCleanupFailure(id, user);
    return true;
  }
}

async function cleanupUnattachedFiles(
  ids: string[],
  current: CompensationRecordForUpdate,
  user: CurrentUser,
) {
  for (const id of ids) await cleanupUnattachedFile(id, current, user);
}

async function recordAttachmentCleanupFailure(id: string, user: CurrentUser) {
  try {
    await getDb().insert(auditEvents).values({
      actorEmail: user.email,
      action: "employee.compensation_attachment_cleanup_failed",
      entityType: "stored_file",
      entityId: id,
      details: "Private compensation attachment cleanup pending",
    });
  } catch {
    console.error("Compensation attachment cleanup pending", {
      storedFileId: id,
    });
  }
}
