import {
  createCodeChallenge,
  createOAuthState,
  oauthCookie,
  randomUrlSafe,
} from "@/lib/google-auth";
import { getGoogleAuthConfig } from "@/lib/runtime-config";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnToCandidate = requestUrl.searchParams.get("returnTo") || "/";
  const returnTo =
    returnToCandidate.startsWith("/") && !returnToCandidate.startsWith("//")
      ? returnToCandidate
      : "/";
  const state = randomUrlSafe();
  const nonce = randomUrlSafe();
  const verifier = randomUrlSafe(48);
  const stateToken = await createOAuthState({
    state,
    nonce,
    verifier,
    returnTo,
  });
  const { clientId } = getGoogleAuthConfig();
  const authorizationUrl = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth",
  );
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${requestUrl.origin}/api/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: await createCodeChallenge(verifier),
    code_challenge_method: "S256",
    prompt:
      requestUrl.searchParams.get("reauth") === "1"
        ? "login"
        : "select_account",
  }).toString();

  const response = new Response(null, {
    status: 302,
    headers: { location: authorizationUrl.toString() },
  });
  response.headers.append("set-cookie", oauthCookie(stateToken));
  return response;
}
