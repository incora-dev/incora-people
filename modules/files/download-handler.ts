import type { CurrentUser } from "@/lib/auth";

type AuthorizedFile = {
  objectKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  kind: string;
};

export function createFileDownloadHandler(dependencies: {
  getCurrentUser: () => Promise<CurrentUser>;
  getAuthorizedFile: (
    id: string,
    user: CurrentUser,
  ) => Promise<AuthorizedFile | null | undefined>;
  getFileObject: (
    objectKey: string,
  ) => Promise<{ body: ReadableStream | null } | null>;
}) {
  return async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    let user: CurrentUser;
    try {
      user = await dependencies.getCurrentUser();
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AuthenticationRequiredError"
      ) {
        return Response.json(
          { error: "Authentication required." },
          { status: 401 },
        );
      }
      throw error;
    }
    const { id } = await context.params;
    const record = await dependencies.getAuthorizedFile(id, user);
    if (record === undefined) {
      return Response.json({ error: "File not found." }, { status: 404 });
    }
    if (record === null) {
      return Response.json({ error: "File access denied." }, { status: 403 });
    }
    const object = await dependencies.getFileObject(record.objectKey);
    if (!object) {
      return Response.json(
        { error: "File content is unavailable." },
        { status: 404 },
      );
    }
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    const canPreview =
      record.contentType.startsWith("image/") ||
      record.contentType === "application/pdf";
    return new Response(object.body, {
      headers: {
        "content-type": record.contentType,
        "content-length": String(record.sizeBytes),
        "content-disposition":
          record.kind === "profile_photo" ||
          record.kind === "profile_cover" ||
          (preview && canPreview)
            ? "inline"
            : contentDisposition(record.originalName),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  };
}

function contentDisposition(name: string) {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
