export function isUniqueConstraintError(error: unknown) {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /unique constraint|SQLITE_CONSTRAINT_UNIQUE/i.test(message);
}
