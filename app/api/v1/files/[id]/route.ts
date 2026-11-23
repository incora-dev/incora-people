import { getApiClientUser } from "@/lib/auth";
import { getAuthorizedStoredFile } from "@/modules/files/authorization";
import { getFilesBucket } from "@/modules/files/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  const { id } = await params;
  const record = await getAuthorizedStoredFile(id, client.user);
  if (record === undefined)
    return Response.json({ error: "File not found." }, { status: 404 });
  if (record === null)
    return Response.json({ error: "File access denied." }, { status: 403 });
  const object = await getFilesBucket().get(record.objectKey);
  if (!object)
    return Response.json(
      { error: "File content is unavailable." },
      { status: 404 },
    );
  const fallback = record.originalName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  return new Response(object.body, {
    headers: {
      "content-type": record.contentType,
      "content-length": String(record.sizeBytes),
      "content-disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
