import {
  fileScanResultSchema,
  getFileScanWebhookSecret,
  hasValidFileScanAuthorization,
  recordFileScanResult,
} from "@/modules/files/scanning";
import { parseJsonRequest } from "@/modules/shared/http";

/** Callback for a separately operated R2 malware scanner. */
export async function POST(request: Request) {
  if (!getFileScanWebhookSecret()) {
    return Response.json(
      { error: "File scanner callback is not configured." },
      { status: 503 },
    );
  }
  if (!hasValidFileScanAuthorization(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const parsed = await parseJsonRequest(request, fileScanResultSchema, 16_384);
  if (!parsed.ok) return parsed.response;
  const result = await recordFileScanResult(parsed.data);
  if (!result)
    return Response.json({ error: "File not found." }, { status: 404 });
  return Response.json({ result });
}
