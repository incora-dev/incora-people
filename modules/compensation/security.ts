export function isCompensationAttachmentForRecord(input: {
  id: string;
  kind: string;
  ownerEmployeeId: number;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  expectedId: string;
  employeeId: number;
  compensationId: number;
}) {
  return (
    input.id === input.expectedId &&
    input.kind === "compensation_attachment" &&
    input.ownerEmployeeId === input.employeeId &&
    input.relatedEntityType === "employee_compensation" &&
    input.relatedEntityId === String(input.compensationId)
  );
}

export async function commitBeforeAttachmentCleanup(
  attachmentIds: string[],
  commit: () => Promise<boolean>,
  cleanup: (id: string) => Promise<void>,
) {
  if (!(await commit())) return { committed: false as const, failedIds: [] };
  const results = await Promise.allSettled(attachmentIds.map(cleanup));
  return {
    committed: true as const,
    failedIds: results.flatMap((result, index) =>
      result.status === "rejected" ? [attachmentIds[index]] : [],
    ),
  };
}

export async function deleteCoreBeforeAttachmentCleanup(
  attachmentIds: string[],
  deleteCore: () => Promise<boolean>,
  cleanup: (id: string) => Promise<void>,
) {
  if (!(await deleteCore())) return { deleted: false as const, failedIds: [] };
  const results = await Promise.allSettled(attachmentIds.map(cleanup));
  return {
    deleted: true as const,
    failedIds: results.flatMap((result, index) =>
      result.status === "rejected" ? [attachmentIds[index]] : [],
    ),
  };
}
