import {
  getClientAccessIdentity,
  revokeClientSession,
} from "@/lib/client-auth";

export async function POST(request: Request) {
  const identity = await getClientAccessIdentity(
    request.headers.get("authorization"),
  );
  if (!identity) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  await revokeClientSession(identity.sessionId);
  return Response.json({ revoked: true });
}
