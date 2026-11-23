import { z } from "zod";
import {
  createCodeChallenge,
  createOAuthState,
  getGoogleSessionEmail,
  oauthCookie,
  randomUrlSafe,
} from "@/lib/google-auth";
import { createClientAuthorizationCode } from "@/lib/client-auth";
import {
  getClientRedirectUri,
  getAppMode,
  getDemoUserEmail,
  getGoogleAuthConfig,
} from "@/lib/runtime-config";

const querySchema = z.object({
  client: z.enum(["chrome_extension", "mobile"]),
  redirect_uri: z.string().url().max(500),
  state: z.string().min(8).max(500),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  code_challenge_method: z.literal("S256"),
});

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(requestUrl.searchParams),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid client authorization request." },
      { status: 400 },
    );
  }
  const redirectUri = getClientRedirectUri(
    parsed.data.client,
    parsed.data.redirect_uri,
  );
  if (!redirectUri) {
    return Response.json(
      { error: "Client redirect URI is not registered." },
      { status: 400 },
    );
  }

  const email =
    getAppMode() === "demo"
      ? getDemoUserEmail()
      : await getGoogleSessionEmail();
  if (email) {
    const authorizationCode = await createClientAuthorizationCode({
      email,
      clientType: parsed.data.client,
      redirectUri,
      codeChallenge: parsed.data.code_challenge,
    });
    const destination = new URL(redirectUri);
    destination.searchParams.set("code", authorizationCode);
    destination.searchParams.set("state", parsed.data.state);
    return Response.redirect(destination, 302);
  }

  const state = randomUrlSafe();
  const nonce = randomUrlSafe();
  const verifier = randomUrlSafe(48);
  const stateToken = await createOAuthState({
    state,
    nonce,
    verifier,
    // After Google establishes the web session, resume this exact PKCE
    // authorization request. This keeps the browser UI out of the extension.
    returnTo: `${requestUrl.pathname}${requestUrl.search}`,
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
    prompt: "select_account",
  }).toString();
  const response = new Response(null, {
    status: 302,
    headers: { location: authorizationUrl.toString() },
  });
  response.headers.append("set-cookie", oauthCookie(stateToken));
  return response;
}
