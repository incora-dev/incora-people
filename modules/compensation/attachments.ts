export function groupCompensationAttachments(
  rows: Array<{ compensationId: string; id: string; name: string }>,
) {
  const grouped = new Map<string, Array<{ id: string; name: string }>>();
  for (const attachment of rows) {
    const list = grouped.get(attachment.compensationId) ?? [];
    list.push({ id: attachment.id, name: attachment.name });
    grouped.set(attachment.compensationId, list);
  }
  return grouped;
}
