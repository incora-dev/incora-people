import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { employeeCompensations, employees, storedFiles } from "@/db/schema";
import { getDateContext } from "@/modules/shared/date";
import { groupCompensationAttachments } from "@/modules/compensation/attachments";
import type { CompensationRecordForUpdate } from "@/modules/compensation/domain";

/** Amounts are intentionally not selected by this list query. */
export async function getCompensationList(employeeId: number) {
  const db = getDb();
  const today = getDateContext().today;
  const rows = await db
    .select({
      id: employeeCompensations.id,
      kind: employeeCompensations.kind,
      label: employeeCompensations.label,
      effectiveFrom: employeeCompensations.effectiveFrom,
      currency: employeeCompensations.currency,
      period: employeeCompensations.period,
      paymentSchedule: employeeCompensations.paymentSchedule,
      comment: employeeCompensations.comment,
    })
    .from(employeeCompensations)
    .where(eq(employeeCompensations.employeeId, employeeId))
    .orderBy(
      desc(employeeCompensations.effectiveFrom),
      desc(employeeCompensations.id),
    );
  const [currentBase] = await db
    .select({ id: employeeCompensations.id })
    .from(employeeCompensations)
    .where(
      and(
        eq(employeeCompensations.employeeId, employeeId),
        eq(employeeCompensations.kind, "base"),
        lte(employeeCompensations.effectiveFrom, today),
      ),
    )
    .orderBy(
      desc(employeeCompensations.effectiveFrom),
      desc(employeeCompensations.id),
    )
    .limit(1);
  const attachmentRows = rows.length
    ? await db
        .select({
          compensationId: storedFiles.relatedEntityId,
          id: storedFiles.id,
          name: storedFiles.originalName,
        })
        .from(storedFiles)
        .where(
          and(
            eq(storedFiles.relatedEntityType, "employee_compensation"),
            inArray(
              storedFiles.relatedEntityId,
              rows.map((row) => String(row.id)),
            ),
          ),
        )
        .orderBy(storedFiles.createdAt)
    : [];
  const rowsWithCompensationId = attachmentRows.filter(
    (
      attachment,
    ): attachment is typeof attachment & { compensationId: string } =>
      attachment.compensationId !== null,
  );
  const attachmentsByCompensation = groupCompensationAttachments(
    rowsWithCompensationId,
  );
  return rows.map((row) => ({
    ...row,
    kind: row.kind as "base" | "additional",
    isCurrent: row.id === currentBase?.id,
    attachments: attachmentsByCompensation.get(String(row.id)) ?? [],
  }));
}

export async function getCompensationForReveal(
  employeeId: number,
  compensationId: number,
) {
  const [row] = await getDb()
    .select({
      id: employeeCompensations.id,
      employeeId: employeeCompensations.employeeId,
      amountCents: employeeCompensations.amountCents,
      currency: employeeCompensations.currency,
    })
    .from(employeeCompensations)
    .innerJoin(employees, eq(employeeCompensations.employeeId, employees.id))
    .where(
      and(
        eq(employeeCompensations.id, compensationId),
        eq(employeeCompensations.employeeId, employeeId),
      ),
    )
    .limit(1);
  return row;
}

/** Internal edit query; amount is never returned by the list/API DTO. */
export async function getCompensationForUpdate(
  employeeId: number,
  compensationId: number,
): Promise<CompensationRecordForUpdate | undefined> {
  const [row] = await getDb()
    .select({
      id: employeeCompensations.id,
      employeeId: employeeCompensations.employeeId,
      kind: employeeCompensations.kind,
      label: employeeCompensations.label,
      effectiveFrom: employeeCompensations.effectiveFrom,
      amountCents: employeeCompensations.amountCents,
      currency: employeeCompensations.currency,
      period: employeeCompensations.period,
      paymentSchedule: employeeCompensations.paymentSchedule,
      comment: employeeCompensations.comment,
    })
    .from(employeeCompensations)
    .where(
      and(
        eq(employeeCompensations.id, compensationId),
        eq(employeeCompensations.employeeId, employeeId),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  if (row.kind !== "base" && row.kind !== "additional") return undefined;
  return { ...row, kind: row.kind };
}
