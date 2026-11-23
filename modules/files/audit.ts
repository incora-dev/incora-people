export function storedFileDeletionAuditDetails(
  kind: string,
  originalName: string,
) {
  return kind === "compensation_attachment"
    ? "Compensation attachment deleted"
    : `${kind}: ${originalName}`;
}
