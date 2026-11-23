import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, webSessions } from "@/db/schema";
import {
  bindProviderSubject,
  findAdmittedAccount,
  findAdmittedAccountById,
  type AdmittedAccount,
} from "@/lib/identity";
import { normalizeVerifiedGoogleIdentity } from "@/modules/people/identity-policy";
import { getGoogleAuthConfig } from "@/lib/runtime-config";

export const GOOGLE_SESSION_COOKIE = "incora_google_session";
export const GOOGLE_OAUTH_COOKIE = "incora_google_oauth";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const OAUTH_MAX_AGE_SECONDS = 10 * 60;

type OAuthClientAuthorization = {
  clientType: "chrome_extension" | "mobile";
  redirectUri: string;
  externalState: string;
  codeChallenge: string;
};

const googleKeySet = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

async function signingKey() {
  const { authSecret } = getGoogleAuthConfig();
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(authSecret)),
  );
}

export function randomUrlSafe(bytes = 32) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString(
    "base64url",
  );
}

export async function createCodeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

export async function createOAuthState(input: {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  clientAuthorization?: OAuthClientAuthorization;
}) {
  return new SignJWT(input)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_MAX_AGE_SECONDS}s`)
    .setAudience("incora-google-oauth")
    .setIssuer("incora-people")
    .sign(await signingKey());
}

export async function verifyOAuthState(token: string) {
  const { payload } = await jwtVerify(token, await signingKey(), {
    audience: "incora-google-oauth",
    issuer: "incora-people",
  });
  if (
    typeof payload.state !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.verifier !== "string" ||
    typeof payload.returnTo !== "string"
  ) {
    throw new Error("OAuth state is invalid.");
  }
  const client =
    payload.clientAuthorization &&
    typeof payload.clientAuthorization === "object" &&
    !Array.isArray(payload.clientAuthorization)
      ? (payload.clientAuthorization as {
          clientType?: unknown;
          redirectUri?: unknown;
          externalState?: unknown;
          codeChallenge?: unknown;
        })
      : null;
  if (
    client &&
    client.clientType !== "chrome_extension" &&
    client.clientType !== "mobile"
  ) {
    throw new Error("OAuth client state is invalid.");
  }
  let clientAuthorization: OAuthClientAuthorization | undefined;
  if (client) {
    if (
      (client.clientType !== "chrome_extension" &&
        client.clientType !== "mobile") ||
      typeof client.redirectUri !== "string" ||
      typeof client.externalState !== "string" ||
      typeof client.codeChallenge !== "string"
    ) {
      throw new Error("OAuth client state is invalid.");
    }
    clientAuthorization = {
      clientType: client.clientType,
      redirectUri: client.redirectUri,
      externalState: client.externalState,
      codeChallenge: client.codeChallenge,
    };
  }
  return {
    state: payload.state,
    nonce: payload.nonce,
    verifier: payload.verifier,
    returnTo: payload.returnTo,
    clientAuthorization,
  };
}

export async function createSession(email: string, subject: string) {
  const account = await findAdmittedAccount(email, subject);
  if (!account)
    throw new Error("Google account is not provisioned or is disabled.");
  if (
    !account.providerSubject &&
    !(await bindProviderSubject(account.userId, subject))
  ) {
    throw new Error("Google account binding conflict.");
  }
  const now = new Date();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(
    now.getTime() + SESSION_MAX_AGE_SECONDS * 1000,
  ).toISOString();
  const db = getDb();
  await db.batch([
    db.insert(webSessions).values({
      id: sessionId,
      userId: account.userId,
      providerSubject: subject,
      expiresAt,
      createdAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    }),
    db
      .update(users)
      .set({ lastLoginAt: now.toISOString() })
      .where(eq(users.id, account.userId)),
  ]);
  return new SignJWT({
    email: account.email,
    uid: account.userId,
    sid: sessionId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .setAudience("incora-session")
    .setIssuer("incora-people")
    .sign(await signingKey());
}

export async function getGoogleSessionEmail() {
  return (await getGoogleSessionIdentity())?.account.email ?? null;
}

export async function getGoogleSessionIdentity(): Promise<{
  account: AdmittedAccount;
  sessionId: string;
  authenticatedAt: string;
} | null> {
  const token = (await cookies()).get(GOOGLE_SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await signingKey(), {
      audience: "incora-session",
      issuer: "incora-people",
    });
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof payload.iat !== "number" ||
      payload.iat + SESSION_MAX_AGE_SECONDS < now ||
      typeof payload.uid !== "number" ||
      typeof payload.sid !== "string" ||
      typeof payload.sub !== "string"
    ) {
      return null;
    }
    const [session] = await getDb()
      .select({
        id: webSessions.id,
        userId: webSessions.userId,
        providerSubject: webSessions.providerSubject,
        expiresAt: webSessions.expiresAt,
        revokedAt: webSessions.revokedAt,
        createdAt: webSessions.createdAt,
      })
      .from(webSessions)
      .where(
        and(
          eq(webSessions.id, payload.sid),
          eq(webSessions.userId, payload.uid),
        ),
      )
      .limit(1);
    if (
      !session ||
      session.revokedAt ||
      session.providerSubject !== payload.sub ||
      new Date(session.expiresAt).getTime() <= Date.now()
    ) {
      return null;
    }
    const account = await findAdmittedAccountById(payload.uid, payload.sub);
    if (!account || account.providerSubject !== payload.sub) return null;
    await getDb()
      .update(webSessions)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(webSessions.id, session.id));
    return {
      account,
      sessionId: session.id,
      authenticatedAt: session.createdAt,
    };
  } catch {
    return null;
  }
}

export async function revokeWebSession(sessionId: string) {
  await getDb()
    .update(webSessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(webSessions.id, sessionId));
}

export async function verifyGoogleIdToken(idToken: string, nonce: string) {
  const { clientId } = getGoogleAuthConfig();
  const { payload } = await jwtVerify(idToken, googleKeySet, {
    audience: clientId,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });
  const identity = normalizeVerifiedGoogleIdentity({
    email: payload.email,
    email_verified: payload.email_verified,
    sub: payload.sub,
  });
  if (payload.nonce !== nonce || !identity) {
    throw new Error("Google identity token is invalid.");
  }
  return identity;
}

export function sessionCookie(value: string) {
  return [
    `${GOOGLE_SESSION_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function oauthCookie(value: string) {
  return [
    `${GOOGLE_OAUTH_COOKIE}=${value}`,
    "Path=/api/auth",
    `Max-Age=${OAUTH_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function clearCookie(name: string, path = "/") {
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
