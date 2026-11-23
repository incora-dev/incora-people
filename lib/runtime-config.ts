import { env } from "cloudflare:workers";
import {
  isValidInvitationSender,
  parseInvitationPublicOrigin,
} from "@/modules/invitations/domain";

export type AppMode = "demo" | "protected";
export type AuthProvider = "cloudflare" | "google";

type RuntimeEnv = {
  APP_MODE?: string;
  DEMO_USER_EMAIL?: string;
  ALLOWED_EMAIL_DOMAIN?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  AUTH_PROVIDER?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_SECRET?: string;
  CHROME_EXTENSION_ID?: string;
  GOOGLE_CHAT_WEBHOOK_URL?: string;
  ANNOUNCEMENT_EMAIL_WEBHOOK_URL?: string;
  ANNOUNCEMENT_WEBHOOK_SECRET?: string;
  INCORA_WEBHOOK_SECRET?: string;
  ANNOUNCEMENT_CRON_SECRET?: string;
  EMPLOYEE_INVITATIONS_ENABLED?: string;
  RESEND_API_KEY?: string;
  INVITATION_FROM_EMAIL?: string;
  PUBLIC_APP_URL?: string;
};

function runtimeEnv() {
  return env as unknown as RuntimeEnv;
}

export function getAnnouncementDeliveryConfig() {
  const environment = runtimeEnv();
  const appMode = environment.APP_MODE || "protected";
  const sender = environment.INVITATION_FROM_EMAIL?.trim() || "";
  return {
    googleChatWebhookUrl: runtimeEnv().GOOGLE_CHAT_WEBHOOK_URL?.trim() || "",
    emailWebhookUrl: runtimeEnv().ANNOUNCEMENT_EMAIL_WEBHOOK_URL?.trim() || "",
    webhookSecret:
      runtimeEnv().ANNOUNCEMENT_WEBHOOK_SECRET?.trim() ||
      runtimeEnv().INCORA_WEBHOOK_SECRET?.trim() ||
      "",
    cronSecret: runtimeEnv().ANNOUNCEMENT_CRON_SECRET?.trim() || "",
    resendApiKey: environment.RESEND_API_KEY?.trim() || "",
    resendFrom: isValidInvitationSender(sender) ? sender : "",
    publicOrigin: parseInvitationPublicOrigin(
      environment.PUBLIC_APP_URL?.trim() || "",
      appMode,
    ),
    appMode,
  };
}

export function getEmployeeInvitationConfig() {
  const environment = runtimeEnv();
  const apiKey = environment.RESEND_API_KEY?.trim() || "";
  const from = environment.INVITATION_FROM_EMAIL?.trim() || "";
  const publicOrigin = parseInvitationPublicOrigin(
    environment.PUBLIC_APP_URL?.trim() || "",
    environment.APP_MODE || "protected",
  );
  const senderValid = isValidInvitationSender(from);
  const googleLoginConfigured =
    environment.AUTH_PROVIDER === "google" &&
    Boolean(
      environment.GOOGLE_CLIENT_ID?.trim() &&
      environment.GOOGLE_CLIENT_SECRET?.trim() &&
      environment.AUTH_SECRET?.trim(),
    );
  const enabled =
    environment.EMPLOYEE_INVITATIONS_ENABLED?.trim().toLowerCase() === "true" &&
    Boolean(apiKey) &&
    senderValid &&
    googleLoginConfigured &&
    Boolean(publicOrigin);

  return {
    enabled,
    apiKey,
    from,
    publicOrigin: publicOrigin ?? "",
    provider: "resend" as const,
  };
}

export function getAppMode(): AppMode {
  return runtimeEnv().APP_MODE === "demo" ? "demo" : "protected";
}

export function getDemoUserEmail() {
  return (
    runtimeEnv().DEMO_USER_EMAIL?.trim().toLowerCase() ||
    "danylo.karpa@incorainc.com"
  );
}

export function getAllowedEmailDomain() {
  return runtimeEnv().ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase() || "*";
}

export function getAuthProvider(): AuthProvider {
  return runtimeEnv().AUTH_PROVIDER === "google" ? "google" : "cloudflare";
}

export function getGoogleAuthConfig() {
  const clientId = runtimeEnv().GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret = runtimeEnv().GOOGLE_CLIENT_SECRET?.trim() || "";
  const authSecret = runtimeEnv().AUTH_SECRET?.trim() || "";
  if (!clientId || !clientSecret || !authSecret) {
    throw new AuthenticationConfigurationError(
      "Google authentication requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and AUTH_SECRET.",
    );
  }
  return { clientId, clientSecret, authSecret };
}

export function getClientAuthSecret() {
  const configured = runtimeEnv().AUTH_SECRET?.trim();
  if (configured) return configured;
  if (getAppMode() === "demo") {
    return "incora-people-local-demo-client-signing-v1";
  }
  throw new AuthenticationConfigurationError(
    "Client authentication requires AUTH_SECRET.",
  );
}

export function getClientRedirectUri(
  clientType: "chrome_extension" | "mobile",
  candidate: string,
) {
  if (clientType === "mobile") {
    return candidate === "incora-people://auth/callback" ? candidate : null;
  }
  const extensionId = runtimeEnv().CHROME_EXTENSION_ID?.trim().toLowerCase();
  if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) return null;
  return candidate === `https://${extensionId}.chromiumapp.org/oauth2`
    ? candidate
    : null;
}

export function getIdentityConfiguration() {
  const mode = getAppMode();
  const provider = getAuthProvider();
  const teamDomain =
    runtimeEnv().CF_ACCESS_TEAM_DOMAIN?.trim().toLowerCase() || "";
  const audience = runtimeEnv().CF_ACCESS_AUD?.trim() || "";
  const googleConfigured = Boolean(
    runtimeEnv().GOOGLE_CLIENT_ID?.trim() &&
    runtimeEnv().GOOGLE_CLIENT_SECRET?.trim() &&
    runtimeEnv().AUTH_SECRET?.trim(),
  );

  return {
    mode,
    provider:
      mode === "protected"
        ? provider === "google"
          ? "Google OAuth"
          : "Cloudflare Access"
        : "Demo identity",
    allowedEmailDomain: getAllowedEmailDomain(),
    configured:
      mode === "demo" ||
      (provider === "google"
        ? googleConfigured
        : Boolean(teamDomain && audience)),
  };
}

export function getCloudflareAccessConfig() {
  const teamDomain =
    runtimeEnv().CF_ACCESS_TEAM_DOMAIN?.trim().toLowerCase() || "";
  const audience = runtimeEnv().CF_ACCESS_AUD?.trim() || "";

  if (!teamDomain || !audience) {
    throw new AuthenticationConfigurationError(
      "Protected mode requires CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD.",
    );
  }

  return { teamDomain, audience };
}

export class AuthenticationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationConfigurationError";
  }
}
