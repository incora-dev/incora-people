import { eq } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getD1, getDb } from "@/db";
import { accessPolicies, protectedAdminAccounts, users } from "@/db/schema";
import {
  getAllowedEmailDomain,
  getAppMode,
  getAuthProvider,
  getCloudflareAccessConfig,
  getDemoUserEmail,
} from "@/lib/runtime-config";
import { getGoogleSessionIdentity } from "@/lib/google-auth";
import { resolvePreviewSession } from "@/modules/view-as/session";
import { getClientAccessIdentity, type ClientType } from "@/lib/client-auth";
import {
  findAdmittedAccount,
  findAdmittedAccountById,
  normalizeEmail,
  type AdmittedAccount,
} from "@/lib/identity";

export type Role = "super_admin" | "hr_admin" | "manager" | "employee";

export type CurrentUser = {
  userId: number | null;
  email: string;
  role: Role;
  employeeId: number | null;
  authenticatedAt?: string;
  isPreview?: boolean;
  previewTargetName?: string;
  previewExpiresAt?: string;
  previewReturnPath?: string;
  previewNotice?: "expired";
};

export type AccessPolicy = typeof accessPolicies.$inferSelect;

const accessKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function getCurrentUser(): Promise<CurrentUser> {
  if (getAppMode() === "demo") {
    const email = getDemoUserEmail();
    return (await getCurrentUserForEmail(email)) ?? demoUser(email);
  }
  if (getAuthProvider() === "google") {
    const identity = await getGoogleSessionIdentity();
    if (!identity) {
      throw new AuthenticationRequiredError(
        "Google authentication is required.",
      );
    }
    const actor = fromAccount(identity.account, identity.authenticatedAt);
    const preview = await resolvePreviewSession(
      getD1(),
      identity.account.userId,
      identity.sessionId,
    );
    if (preview?.state === "active") {
      return {
        userId: preview.targetUserId,
        email: preview.targetEmail,
        role: preview.targetRole as Role,
        employeeId: preview.targetEmployeeId,
        isPreview: true,
        previewTargetName: preview.targetName,
        previewExpiresAt: preview.expiresAt,
        previewReturnPath: preview.returnPath,
      };
    }
    if (preview?.state === "expired") {
      redirect("/view-as-expired");
    }
    return actor;
  }
  const identity = await getCloudflareAccessIdentity();
  return requireAdmittedAccount(
    await findAdmittedAccount(normalizeEmail(identity.email)),
    identity.authenticatedAt,
  );
}

export async function getApiCurrentUser(
  request: Request,
): Promise<CurrentUser> {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    throw new AuthenticationRequiredError("Client authentication is required.");
  }
  return clientUser.user;
}

export async function getApiClientUser(
  request: Request,
): Promise<{ user: CurrentUser; clientType: ClientType } | null> {
  const identity = await getClientAccessIdentity(
    request.headers.get("authorization"),
  );
  if (!identity) return null;
  if (
    !isClientPathAllowed(identity.clientType, new URL(request.url).pathname)
  ) {
    return null;
  }
  const user =
    identity.userId === null
      ? ((await getCurrentUserForEmail(identity.email)) ??
        (getAppMode() === "demo" ? demoUser(identity.email) : null))
      : requireAdmittedAccount(
          await findAdmittedAccountById(
            identity.userId,
            identity.providerSubject ?? undefined,
          ),
          identity.authenticatedAt,
        );
  if (!user) return null;
  return {
    user,
    clientType: identity.clientType,
  };
}

export function isClientPathAllowed(clientType: ClientType, pathname: string) {
  if (clientType === "mobile") return pathname.startsWith("/api/v1/");
  return [
    "/api/v1/auth/revoke",
    "/api/v1/time/status",
    "/api/v1/time/clock-in",
    "/api/v1/time/clock-out",
  ].includes(pathname);
}

async function getCurrentUserForEmail(email: string) {
  const account = await findAdmittedAccount(normalizeEmail(email));
  return account ? fromAccount(account) : null;
}

function requireAdmittedAccount(
  account: AdmittedAccount | null,
  authenticatedAt?: string,
) {
  if (!account) {
    throw new AuthenticationRequiredError(
      "This account is not provisioned or is disabled.",
    );
  }
  return fromAccount(account, authenticatedAt);
}

function fromAccount(
  account: AdmittedAccount,
  authenticatedAt?: string,
): CurrentUser {
  return {
    userId: account.userId,
    email: account.email,
    role: account.role,
    employeeId: account.employeeId,
    ...(authenticatedAt ? { authenticatedAt } : {}),
  };
}

function demoUser(email: string): CurrentUser {
  return {
    userId: null,
    email: normalizeEmail(email),
    role: "employee",
    employeeId: null,
  };
}

async function getCloudflareAccessIdentity() {
  const requestHeaders = await headers();
  const token = requestHeaders.get("cf-access-jwt-assertion");
  if (!token) {
    throw new AuthenticationRequiredError(
      "Cloudflare Access authentication is required.",
    );
  }

  const { teamDomain, audience } = getCloudflareAccessConfig();
  const issuer = `https://${teamDomain}.cloudflareaccess.com`;
  let keySet = accessKeySets.get(issuer);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    accessKeySets.set(issuer, keySet);
  }

  try {
    const { payload } = await jwtVerify(token, keySet, {
      audience,
      issuer,
    });
    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : "";
    const allowedDomain = getAllowedEmailDomain();
    if (
      !email ||
      (allowedDomain !== "*" && !email.endsWith(`@${allowedDomain}`))
    ) {
      throw new AuthenticationRequiredError(
        "This email domain is not allowed.",
      );
    }
    const authTimestamp =
      typeof payload.auth_time === "number"
        ? payload.auth_time
        : typeof payload.iat === "number"
          ? payload.iat
          : null;
    if (!authTimestamp || !Number.isFinite(authTimestamp)) {
      throw new AuthenticationRequiredError(
        "Cloudflare Access authentication freshness is unavailable.",
      );
    }
    return {
      email,
      authenticatedAt: new Date(authTimestamp * 1000).toISOString(),
    };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) throw error;
    throw new AuthenticationRequiredError(
      "Cloudflare Access token is invalid.",
    );
  }
}

export function hasOrganizationScope(user: Pick<CurrentUser, "role">) {
  return user.role === "super_admin" || user.role === "hr_admin";
}

/** Sensitive exports and access administration require a fresh sign-in. */
export function hasRecentAuthentication(
  user: Pick<CurrentUser, "authenticatedAt">,
  maxAgeSeconds = 15 * 60,
) {
  if (getAppMode() === "demo") return true;
  if (!user.authenticatedAt) return false;
  const age = Date.now() - new Date(user.authenticatedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age <= maxAgeSeconds * 1000;
}

export function recentAuthenticationResponse(returnTo: string) {
  const reauthenticateUrl =
    getAuthProvider() === "cloudflare"
      ? `/cdn-cgi/access/login?redirect_url=${encodeURIComponent(returnTo)}`
      : `/api/auth/google?reauth=1&returnTo=${encodeURIComponent(returnTo)}`;
  return Response.json(
    {
      error: "Recent re-authentication is required for this action.",
      reauthenticateUrl,
    },
    { status: 428 },
  );
}

export async function isProtectedSuperAdminEmail(email: string) {
  const [account] = await getDb()
    .select({ userId: protectedAdminAccounts.userId })
    .from(protectedAdminAccounts)
    .innerJoin(users, eq(protectedAdminAccounts.userId, users.id))
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return Boolean(account);
}

export async function isProtectedSuperAdminUserId(userId: number) {
  const [account] = await getDb()
    .select({ userId: protectedAdminAccounts.userId })
    .from(protectedAdminAccounts)
    .where(eq(protectedAdminAccounts.userId, userId))
    .limit(1);
  return Boolean(account);
}

export class AuthenticationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export async function getAccessPolicy(
  user: CurrentUser,
): Promise<AccessPolicy> {
  const [policy] = await getDb()
    .select()
    .from(accessPolicies)
    .where(eq(accessPolicies.role, user.role))
    .limit(1);
  if (policy) return policy;
  return {
    id: 0,
    role: user.role,
    label: user.role,
    managePeople: false,
    viewSensitiveData: false,
    approveLeave: false,
    approveTime: false,
    approveExpenses: false,
    viewAudit: false,
    manageSettings: false,
    manageInventory: false,
    updatedAt: new Date().toISOString(),
  };
}

export async function canManageProjects(user: CurrentUser) {
  if (user.role === "super_admin") return true;
  const [account] = await getDb()
    .select({ manageProjects: users.manageProjects })
    .from(users)
    .where(
      user.userId === null
        ? eq(users.email, user.email)
        : eq(users.id, user.userId),
    )
    .limit(1);
  return Boolean(account?.manageProjects);
}
