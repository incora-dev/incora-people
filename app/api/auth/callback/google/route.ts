import {
  clearCookie,
  createSession,
  GOOGLE_OAUTH_COOKIE,
  sessionCookie,
  verifyGoogleIdToken,
  verifyOAuthState,
} from "@/lib/google-auth";
import { createClientAuthorizationCode } from "@/lib/client-auth";
import { getGoogleAuthConfig } from "@/lib/runtime-config";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthToken = readCookie(
    request.headers.get("cookie") || "",
    GOOGLE_OAUTH_COOKIE,
  );
  if (!code || !state || !oauthToken) {
    return loginFailure(requestUrl, "missing_oauth_response");
  }

  try {
    const oauthState = await verifyOAuthState(oauthToken);
    if (oauthState.state !== state) {
      return loginFailure(requestUrl, "invalid_state");
    }
    const { clientId, clientSecret } = getGoogleAuthConfig();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${requestUrl.origin}/api/auth/callback/google`,
        grant_type: "authorization_code",
        code_verifier: oauthState.verifier,
      }),
    });
    if (!tokenResponse.ok) {
      return loginFailure(requestUrl, "token_exchange_failed");
    }
    const tokens = (await tokenResponse.json()) as { id_token?: string };
    if (!tokens.id_token) {
      return loginFailure(requestUrl, "missing_identity_token");
    }
    const identity = await verifyGoogleIdToken(
      tokens.id_token,
      oauthState.nonce,
    );
    if (oauthState.clientAuthorization) {
      const authorizationCode = await createClientAuthorizationCode({
        email: identity.email,
        providerSubject: identity.subject,
        clientType: oauthState.clientAuthorization.clientType,
        redirectUri: oauthState.clientAuthorization.redirectUri,
        codeChallenge: oauthState.clientAuthorization.codeChallenge,
      });
      const destination = new URL(oauthState.clientAuthorization.redirectUri);
      destination.searchParams.set("code", authorizationCode);
      destination.searchParams.set(
        "state",
        oauthState.clientAuthorization.externalState,
      );
      const response = new Response(null, {
        status: 302,
        headers: { location: destination.toString() },
      });
      response.headers.append(
        "set-cookie",
        clearCookie(GOOGLE_OAUTH_COOKIE, "/api/auth"),
      );
      return response;
    }
    const session = await createSession(identity.email, identity.subject);
    const response = new Response(null, {
      status: 302,
      headers: {
        location: new URL(
          oauthState.returnTo || "/",
          requestUrl.origin,
        ).toString(),
      },
    });
    response.headers.append("set-cookie", sessionCookie(session));
    response.headers.append(
      "set-cookie",
      clearCookie(GOOGLE_OAUTH_COOKIE, "/api/auth"),
    );
    return response;
  } catch {
    return loginFailure(requestUrl, "invalid_oauth_response");
  }
}

function readCookie(cookieHeader: string, name: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function loginFailure(requestUrl: URL, reason: string) {
  const destination = new URL("/login", requestUrl.origin);
  destination.searchParams.set("error", reason);
  const response = new Response(null, {
    status: 302,
    headers: { location: destination.toString() },
  });
  response.headers.append(
    "set-cookie",
    clearCookie(GOOGLE_OAUTH_COOKIE, "/api/auth"),
  );
  return response;
}
