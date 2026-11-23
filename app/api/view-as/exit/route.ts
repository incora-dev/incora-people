import { getGoogleSessionIdentity } from "@/lib/google-auth";
import {
  endEmployeePreview,
  PreviewCommandError,
} from "@/modules/view-as/server";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (
    origin !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return Response.json(
      { error: "Same-origin request required." },
      { status: 403, headers: noStore },
    );
  }
  const identity = await getGoogleSessionIdentity();
  if (!identity) {
    return Response.json(
      { error: "The original administrator session is no longer valid." },
      { status: 401, headers: noStore },
    );
  }
  try {
    const result = await endEmployeePreview({
      actorUserId: identity.account.userId,
      sessionId: identity.sessionId,
    });
    return Response.json(result, { headers: noStore });
  } catch (error) {
    if (error instanceof PreviewCommandError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: noStore },
      );
    }
    return Response.json(
      { error: "Could not exit employee preview." },
      { status: 500, headers: noStore },
    );
  }
}

const noStore = { "cache-control": "private, no-store" };
