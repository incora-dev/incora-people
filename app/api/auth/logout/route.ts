import {
  clearCookie,
  getGoogleSessionIdentity,
  GOOGLE_SESSION_COOKIE,
  revokeWebSession,
} from "@/lib/google-auth";

export async function GET(request: Request) {
  try {
    const identity = await getGoogleSessionIdentity();
    if (identity) await revokeWebSession(identity.sessionId);
  } catch {
    // Clearing the cookie is still safe if the local/demo auth config is absent.
  }
  const response = new Response(null, {
    status: 302,
    headers: { location: new URL("/login", request.url).toString() },
  });
  response.headers.append("set-cookie", clearCookie(GOOGLE_SESSION_COOKIE));
  return response;
}
