import { and, eq, inArray, isNull } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { getDb } from "@/db";
import {
  clientSessionRefreshTokens,
  clientSessions,
  oauthAuthorizationCodes,
  users,
} from "@/db/schema";
import { createCodeChallenge, randomUrlSafe } from "@/lib/google-auth";
import { findAdmittedAccount, findAdmittedAccountById } from "@/lib/identity";
import {
  getAppMode,
  getClientAuthSecret,
  getDemoUserEmail,
} from "@/lib/runtime-config";

export const CLIENT_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const CLIENT_ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const AUTHORIZATION_CODE_MAX_AGE_SECONDS = 60;

export type ClientType = "chrome_extension" | "mobile";

export type ClientAccessIdentity = {
  email: string;
  userId: number | null;
  providerSubject: string | null;
  sessionId: string;
  clientType: ClientType;
  authenticatedAt: string;
};

async function signingKey() {
  const authSecret = getClientAuthSecret();
  return new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`incora-client-api:${authSecret}`),
    ),
  );
}

export async function createClientAuthorizationCode(input: {
  email: string;
  clientType: ClientType;
  redirectUri: string;
  codeChallenge: string;
  providerSubject?: string;
}) {
  const account = await resolveClientAccount(
    input.email,
    input.providerSubject,
  );
  const code = randomUrlSafe(32);
  const now = new Date();
  await getDb()
    .insert(oauthAuthorizationCodes)
    .values({
      codeHash: await tokenHash(code),
      userEmail: input.email.trim().toLowerCase(),
      userId: account?.userId ?? null,
      clientType: input.clientType,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      expiresAt: new Date(
        now.getTime() + AUTHORIZATION_CODE_MAX_AGE_SECONDS * 1000,
      ).toISOString(),
    });
  return code;
}

export async function exchangeClientAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  deviceId: string;
}) {
  const db = getDb();
  const codeHash = await tokenHash(input.code);
  const [authorization] = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.codeHash, codeHash))
    .limit(1);
  if (
    !authorization ||
    authorization.usedAt ||
    new Date(authorization.expiresAt).getTime() <= Date.now()
  ) {
    return null;
  }
  if (
    (await createCodeChallenge(input.codeVerifier)) !==
    authorization.codeChallenge
  ) {
    return null;
  }
  const account = authorization.userId
    ? await findAdmittedAccountById(authorization.userId)
    : await findAdmittedAccount(authorization.userEmail);
  if (!account && getAppMode() !== "demo") return null;

  const usedAt = new Date().toISOString();
  const [claimed] = await db
    .update(oauthAuthorizationCodes)
    .set({ usedAt })
    .where(
      and(
        eq(oauthAuthorizationCodes.codeHash, codeHash),
        isNull(oauthAuthorizationCodes.usedAt),
      ),
    )
    .returning({ codeHash: oauthAuthorizationCodes.codeHash });
  if (!claimed) return null;

  return createClientSession({
    email: account?.email ?? authorization.userEmail,
    userId: account?.userId ?? null,
    clientType: authorization.clientType as ClientType,
    deviceId: input.deviceId,
    recordLogin: true,
  });
}

export async function refreshClientSession(input: {
  refreshToken: string;
  deviceId: string;
}) {
  const db = getDb();
  const refreshTokenHash = await tokenHash(input.refreshToken);
  const [tokenRecord] = await db
    .select()
    .from(clientSessionRefreshTokens)
    .where(eq(clientSessionRefreshTokens.tokenHash, refreshTokenHash))
    .limit(1);
  if (!tokenRecord) return null;
  const [session] = await db
    .select()
    .from(clientSessions)
    .where(eq(clientSessions.id, tokenRecord.sessionId))
    .limit(1);
  if (tokenRecord.usedAt || tokenRecord.revokedAt) {
    await revokeRefreshTokenFamily(tokenRecord.tokenFamilyId);
    return null;
  }
  if (
    !session ||
    session.revokedAt ||
    session.deviceId !== input.deviceId ||
    new Date(session.expiresAt).getTime() <= Date.now()
  ) {
    return null;
  }
  const account = session.userId
    ? await findAdmittedAccountById(session.userId)
    : await findAdmittedAccount(session.userEmail);
  if (!account) return null;

  const nextRefreshToken = randomUrlSafe(48);
  const now = new Date().toISOString();
  const nextRefreshTokenHash = await tokenHash(nextRefreshToken);
  const [claimed] = await db
    .update(clientSessionRefreshTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(clientSessionRefreshTokens.id, tokenRecord.id),
        isNull(clientSessionRefreshTokens.usedAt),
        isNull(clientSessionRefreshTokens.revokedAt),
      ),
    )
    .returning({ id: clientSessionRefreshTokens.id });
  if (!claimed) {
    await revokeRefreshTokenFamily(tokenRecord.tokenFamilyId);
    return null;
  }

  let rotated;
  try {
    [rotated] = await db
      .update(clientSessions)
      .set({
        refreshTokenHash: nextRefreshTokenHash,
        lastUsedAt: now,
      })
      .where(
        and(
          eq(clientSessions.id, session.id),
          eq(clientSessions.refreshTokenHash, refreshTokenHash),
          isNull(clientSessions.revokedAt),
        ),
      )
      .returning();
    if (!rotated) throw new Error("Refresh session changed during rotation.");
    await db.insert(clientSessionRefreshTokens).values({
      id: crypto.randomUUID(),
      sessionId: session.id,
      tokenFamilyId: tokenRecord.tokenFamilyId,
      tokenHash: nextRefreshTokenHash,
      issuedAt: now,
    });
  } catch {
    await revokeRefreshTokenFamily(tokenRecord.tokenFamilyId);
    return null;
  }

  return clientTokenResponse(rotated, nextRefreshToken);
}

export async function getClientAccessIdentity(
  authorization: string | null,
): Promise<ClientAccessIdentity | null> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await signingKey(), {
      audience: "incora-api",
      issuer: "incora-people",
    });
    if (
      typeof payload.email !== "string" ||
      typeof payload.sid !== "string" ||
      (payload.client !== "chrome_extension" && payload.client !== "mobile")
    ) {
      return null;
    }
    const [session] = await getDb()
      .select({
        id: clientSessions.id,
        expiresAt: clientSessions.expiresAt,
        clientType: clientSessions.clientType,
        createdAt: clientSessions.createdAt,
      })
      .from(clientSessions)
      .where(
        and(
          eq(clientSessions.id, payload.sid),
          isNull(clientSessions.revokedAt),
        ),
      )
      .limit(1);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    if (session.clientType !== payload.client) return null;
    const [accountSession] = await getDb()
      .select({
        userId: clientSessions.userId,
        userEmail: clientSessions.userEmail,
      })
      .from(clientSessions)
      .where(eq(clientSessions.id, payload.sid))
      .limit(1);
    if (!accountSession) return null;
    const account = accountSession.userId
      ? await findAdmittedAccountById(accountSession.userId)
      : await findAdmittedAccount(accountSession.userEmail);
    if (!account || account.email !== payload.email.trim().toLowerCase())
      return null;
    return {
      email: account.email,
      userId: account.userId,
      providerSubject: account.providerSubject,
      sessionId: payload.sid,
      clientType: payload.client,
      authenticatedAt: session.createdAt,
    };
  } catch {
    return null;
  }
}

export async function revokeClientSession(sessionId: string) {
  const [session] = await getDb()
    .select({ tokenFamilyId: clientSessions.tokenFamilyId })
    .from(clientSessions)
    .where(eq(clientSessions.id, sessionId))
    .limit(1);
  if (session) await revokeRefreshTokenFamily(session.tokenFamilyId);
}

export async function revokeAllClientSessions(userId: number) {
  const db = getDb();
  const sessions = await db
    .select({ tokenFamilyId: clientSessions.tokenFamilyId })
    .from(clientSessions)
    .where(
      and(eq(clientSessions.userId, userId), isNull(clientSessions.revokedAt)),
    );
  if (!sessions.length) return;
  const now = new Date().toISOString();
  const families = sessions.map((session) => session.tokenFamilyId);
  await db.batch([
    db
      .update(clientSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(clientSessions.userId, userId),
          isNull(clientSessions.revokedAt),
        ),
      ),
    db
      .update(clientSessionRefreshTokens)
      .set({ revokedAt: now })
      .where(inArray(clientSessionRefreshTokens.tokenFamilyId, families)),
  ]);
}

async function createClientSession(input: {
  email: string;
  userId: number | null;
  clientType: ClientType;
  deviceId: string;
  recordLogin?: boolean;
}) {
  const account = input.userId
    ? await findAdmittedAccountById(input.userId)
    : await resolveClientAccount(input.email);
  if (!account && getAppMode() !== "demo") return null;
  const refreshToken = randomUrlSafe(48);
  const refreshTokenHash = await tokenHash(refreshToken);
  const now = new Date();
  const session = {
    id: crypto.randomUUID(),
    userEmail: account?.email ?? input.email.trim().toLowerCase(),
    userId: account?.userId ?? null,
    clientType: input.clientType,
    deviceId: input.deviceId,
    tokenFamilyId: crypto.randomUUID(),
    refreshTokenHash,
    expiresAt: new Date(
      now.getTime() + CLIENT_SESSION_MAX_AGE_SECONDS * 1000,
    ).toISOString(),
    lastUsedAt: now.toISOString(),
  };
  const db = getDb();
  const sessionInsert = db.insert(clientSessions).values(session);
  const refreshTokenInsert = db.insert(clientSessionRefreshTokens).values({
    id: crypto.randomUUID(),
    sessionId: session.id,
    tokenFamilyId: session.tokenFamilyId,
    tokenHash: refreshTokenHash,
    issuedAt: now.toISOString(),
  });
  if (input.recordLogin && session.userId !== null) {
    await db.batch([
      sessionInsert,
      refreshTokenInsert,
      db
        .update(users)
        .set({ lastLoginAt: now.toISOString() })
        .where(eq(users.id, session.userId)),
    ]);
  } else {
    await db.batch([sessionInsert, refreshTokenInsert]);
  }
  return clientTokenResponse(session, refreshToken);
}

async function revokeRefreshTokenFamily(tokenFamilyId: string) {
  const now = new Date().toISOString();
  const db = getDb();
  await db.batch([
    db
      .update(clientSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(clientSessions.tokenFamilyId, tokenFamilyId),
          isNull(clientSessions.revokedAt),
        ),
      ),
    db
      .update(clientSessionRefreshTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(clientSessionRefreshTokens.tokenFamilyId, tokenFamilyId),
          isNull(clientSessionRefreshTokens.revokedAt),
        ),
      ),
  ]);
}

async function clientTokenResponse(
  session: Pick<
    typeof clientSessions.$inferSelect,
    "id" | "userEmail" | "userId" | "clientType" | "expiresAt"
  >,
  refreshToken: string,
) {
  const accessToken = await new SignJWT({
    email: session.userEmail,
    sid: session.id,
    client: session.clientType,
    ...(session.userId ? { uid: session.userId } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CLIENT_ACCESS_TOKEN_MAX_AGE_SECONDS}s`)
    .setAudience("incora-api")
    .setIssuer("incora-people")
    .sign(await signingKey());
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer" as const,
    expiresIn: CLIENT_ACCESS_TOKEN_MAX_AGE_SECONDS,
    sessionExpiresAt: session.expiresAt,
  };
}

async function resolveClientAccount(email: string, providerSubject?: string) {
  const account = await findAdmittedAccount(email, providerSubject);
  if (account) return account;
  if (
    getAppMode() === "demo" &&
    email.trim().toLowerCase() === getDemoUserEmail()
  ) {
    return null;
  }
  throw new Error("Client account is not provisioned or is disabled.");
}

async function tokenHash(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
