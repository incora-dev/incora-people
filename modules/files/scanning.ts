import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getD1, getDb } from "@/db";
import { storedFiles } from "@/db/schema";

export const fileScanResultSchema = z
  .object({
    fileId: z.string().trim().min(1).max(128),
    status: z.enum(["clean", "quarantined", "failed"]),
    provider: z.string().trim().min(1).max(80),
    error: z.string().trim().max(500).default(""),
    scannedAt: z.string().datetime().optional(),
  })
  .strict();

export type FileScanStatus = "unscanned" | "clean" | "quarantined" | "failed";

type ScanEnv = {
  APP_MODE?: string;
  FILES_REQUIRE_SCAN?: string;
  FILE_SCAN_WEBHOOK_SECRET?: string;
};

function scanEnv() {
  return env as unknown as ScanEnv;
}

/** Scanning is an explicit production control and never silently enabled in demo mode. */
export function filesRequireScan() {
  const value = scanEnv().FILES_REQUIRE_SCAN?.trim().toLowerCase();
  return (
    scanEnv().APP_MODE !== "demo" &&
    (value === "1" || value === "true" || value === "yes")
  );
}

export function isFileScanAvailable(status: FileScanStatus | string | null) {
  return !filesRequireScan() || status === "clean";
}

export function getFileScanWebhookSecret() {
  return scanEnv().FILE_SCAN_WEBHOOK_SECRET?.trim() || "";
}

/** Compare bearer secrets without returning early on the first differing byte. */
export function timingSafeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export function hasValidFileScanAuthorization(request: Request) {
  const secret = getFileScanWebhookSecret();
  if (!secret) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  return timingSafeEqual(provided, secret);
}

/**
 * Persist a scanner decision and its audit event together. The binary remains
 * in private R2; quarantined/failed rows are denied by the file authorization
 * layer when FILES_REQUIRE_SCAN is enabled.
 */
export async function recordFileScanResult(
  input: z.output<typeof fileScanResultSchema>,
) {
  const [file] = await getDb()
    .select({ id: storedFiles.id, originalName: storedFiles.originalName })
    .from(storedFiles)
    .where(eq(storedFiles.id, input.fileId))
    .limit(1);
  if (!file) return null;

  const scannedAt = input.scannedAt ?? new Date().toISOString();
  const error = input.status === "clean" ? "" : input.error;
  const d1 = getD1();
  await d1.batch([
    d1
      .prepare(
        "UPDATE stored_files SET scan_status=?, scanned_at=?, scan_provider=?, scan_error=? WHERE id=?",
      )
      .bind(input.status, scannedAt, input.provider, error, input.fileId),
    d1
      .prepare(
        "INSERT INTO audit_events(actor_email, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        `scanner:${input.provider}`,
        `file.scan_${input.status}`,
        "stored_file",
        input.fileId,
        `${file.originalName}: ${error || "clean"}`.slice(0, 700),
      ),
  ]);

  return {
    id: file.id,
    status: input.status,
    scannedAt,
    provider: input.provider,
  };
}
