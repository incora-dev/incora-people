/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { jwtVerify } from "jose";
import { resolvePreviewSession } from "../modules/view-as/session.ts";
import { decidePreviewRequest } from "../modules/view-as/policy.ts";
import { isPublicInformationPath } from "../modules/shared/public-information.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  APP_MODE?: string;
  AUTH_PROVIDER?: string;
  AUTH_SECRET?: string;
  ANNOUNCEMENT_CRON_SECRET?: string;
  CHROME_EXTENSION_ID?: string;
  PUBLIC_APP_URL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const requestId = getRequestId(request);

    const usesGoogleAuth =
      env.APP_MODE === "protected" && env.AUTH_PROVIDER === "google";
    const isClientApi = url.pathname.startsWith("/api/v1/");
    const hasBearerToken = /^Bearer\s+\S+$/i.test(
      request.headers.get("authorization") ?? "",
    );
    const publicAuthPath =
      url.pathname === "/login" ||
      isPublicInformationPath(url.pathname) ||
      url.pathname.startsWith("/api/auth/") ||
      url.pathname.startsWith("/api/v1/auth/") ||
      url.pathname === "/api/internal/announcement-delivery" ||
      url.pathname === "/api/internal/file-scan" ||
      url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/downloads/") ||
      url.pathname.startsWith("/_next/") ||
      url.pathname.startsWith("/_vinext/") ||
      url.pathname === "/manifest.webmanifest" ||
      url.pathname === "/favicon.svg" ||
      url.pathname === "/apple-touch-icon.png" ||
      url.pathname === "/pwa-icon-192.png" ||
      url.pathname === "/pwa-icon-512.png" ||
      url.pathname === "/pwa-icon-maskable-512.png" ||
      url.pathname === "/incora-logo.png" ||
      url.pathname === "/og.png";
    if (await isRateLimitedAuthRequest(request, url, env)) {
      return Response.json(
        { error: "Too many authentication attempts. Try again shortly." },
        {
          status: 429,
          headers: { "retry-after": "60", "x-request-id": requestId },
        },
      );
    }
    const extensionOrigin = request.headers.get("origin") ?? "";
    const configuredExtensionOrigin = validExtensionOrigin(
      env.CHROME_EXTENSION_ID,
    );
    const isChromeExtension =
      Boolean(configuredExtensionOrigin) &&
      extensionOrigin === configuredExtensionOrigin;
    if (isClientApi && request.method === "OPTIONS" && isChromeExtension) {
      return new Response(null, {
        status: 204,
        headers: {
          ...clientCorsHeaders(extensionOrigin),
          "x-request-id": requestId,
        },
      });
    }
    if (isRejectedBrowserMutation(request, url, isClientApi)) {
      return Response.json(
        { error: "Cross-site request rejected." },
        { status: 403, headers: { "x-request-id": requestId } },
      );
    }
    const googleSession = usesGoogleAuth
      ? await getValidGoogleSession(request, env)
      : null;
    if (
      usesGoogleAuth &&
      !publicAuthPath &&
      !(isClientApi && hasBearerToken) &&
      !googleSession
    ) {
      if (url.pathname.startsWith("/api/")) {
        return Response.json(
          { error: "Google authentication is required." },
          { status: 401, headers: { "x-request-id": requestId } },
        );
      }
      const loginUrl = new URL("/login", url.origin);
      loginUrl.searchParams.set("next", `${url.pathname}${url.search}`);
      return Response.redirect(loginUrl, 302);
    }

    const preview =
      usesGoogleAuth && googleSession
        ? await resolvePreviewSession(
            env.DB,
            googleSession.userId,
            googleSession.sessionId,
          )
        : null;
    const previewHeaders = [
      "x-incora-view-as-state",
      "x-incora-view-as-target",
      "x-incora-view-as-expires",
      "x-incora-view-as-return",
    ];
    if (preview) {
      const decision = decidePreviewRequest({
        method: request.method,
        pathname: url.pathname,
        expired: preview.state === "expired",
      });
      if (
        decision === "redirect-expired" ||
        decision === "redirect-unavailable"
      ) {
        const destination =
          decision === "redirect-expired"
            ? "/view-as-expired"
            : "/view-as-unavailable";
        return new Response(null, {
          status: 303,
          headers: {
            location: new URL(destination, url.origin).toString(),
            "cache-control": "private, no-store",
            "x-request-id": requestId,
          },
        });
      }
      if (decision === "deny") {
        return Response.json(
          {
            error:
              "This operation is unavailable in read-only employee preview.",
          },
          {
            status: 403,
            headers: {
              "cache-control": "private, no-store",
              "x-request-id": requestId,
            },
          },
        );
      }

      const trustedHeaders = new Headers(request.headers);
      for (const header of previewHeaders) trustedHeaders.delete(header);
      trustedHeaders.set("x-incora-view-as-state", preview.state);
      trustedHeaders.set(
        "x-incora-view-as-target",
        encodeURIComponent(preview.targetName),
      );
      trustedHeaders.set("x-incora-view-as-expires", preview.expiresAt);
      trustedHeaders.set("x-incora-view-as-return", preview.returnPath);
      request = new Request(request, { headers: trustedHeaders });
    } else if (previewHeaders.some((header) => request.headers.has(header))) {
      const trustedHeaders = new Headers(request.headers);
      for (const header of previewHeaders) trustedHeaders.delete(header);
      request = new Request(request, { headers: trustedHeaders });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    let response: Response;
    try {
      response = await handler.fetch(request, env, ctx);
    } catch (error) {
      // Keep production logs useful for tracing while excluding request bodies,
      // cookies, authorization headers and personal data.
      console.error(
        JSON.stringify({
          event: "request.error",
          requestId,
          method: request.method,
          path: url.pathname,
          error: error instanceof Error ? error.message : "unknown_error",
        }),
      );
      response = Response.json(
        { error: "Internal server error.", requestId },
        { status: 500, headers: { "x-request-id": requestId } },
      );
    }
    const secured = new Response(response.body, response);
    secured.headers.set("x-request-id", requestId);
    secured.headers.set("x-content-type-options", "nosniff");
    secured.headers.set("x-frame-options", "DENY");
    secured.headers.set("referrer-policy", "strict-origin-when-cross-origin");
    secured.headers.set(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=()",
    );
    secured.headers.set(
      "content-security-policy",
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://accounts.google.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com; frame-src https://accounts.google.com;",
    );
    if (url.protocol === "https:") {
      secured.headers.set(
        "strict-transport-security",
        "max-age=31536000; includeSubDomains",
      );
    }
    if (preview || url.pathname.startsWith("/api/") || googleSession) {
      secured.headers.set("cache-control", "private, no-store");
      secured.headers.set("vary", "cookie");
    }
    if (isClientApi && isChromeExtension) {
      for (const [name, value] of Object.entries(
        clientCorsHeaders(extensionOrigin),
      )) {
        secured.headers.set(name, value);
      }
    }
    return secured;
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(cleanupExpiredAuthArtifacts(env));
    ctx.waitUntil(processNotificationOutbox(env));
    if (!env.ANNOUNCEMENT_CRON_SECRET) return;
    const publicOrigin =
      env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "https://incora-people.incora-people.workers.dev";
    ctx.waitUntil(
      worker
        .fetch(
          new Request(`${publicOrigin}/api/internal/announcement-delivery`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${env.ANNOUNCEMENT_CRON_SECRET}`,
            },
          }),
          env,
          ctx,
        )
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `Scheduled announcement delivery returned ${response.status}.`,
            );
          }
        }),
    );
  },
};

async function cleanupExpiredAuthArtifacts(env: Env) {
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM web_sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= datetime('now', '-30 days'))",
      ).bind(now),
      env.DB.prepare(
        "DELETE FROM client_sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= datetime('now', '-30 days'))",
      ).bind(now),
      env.DB.prepare(
        "DELETE FROM oauth_authorization_codes WHERE expires_at <= ? OR used_at IS NOT NULL",
      ).bind(now),
      env.DB.prepare("DELETE FROM auth_rate_limits WHERE reset_at <= ?").bind(
        now,
      ),
    ]);
  } catch {
    // Cleanup is best-effort; an unavailable table during an older deployment
    // must not interrupt scheduled announcement delivery.
    console.warn(JSON.stringify({ event: "auth_artifact_cleanup_failed" }));
  }
}

type NotificationOutboxRow = {
  id: string;
  user_email: string;
  user_id: number | null;
  title: string;
  message: string;
  href: string;
  attempts: number;
};

/** Deliver pending mobile pushes with bounded retries and idempotent claims. */
async function processNotificationOutbox(env: Env) {
  const now = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + 5 * 60_000).toISOString();
  const due = await env.DB.prepare(
    `SELECT id, user_email, user_id, title, message, href, attempts
       FROM notification_outbox
      WHERE available_at <= ?
        AND status IN ('pending', 'processing')
      ORDER BY available_at, created_at
      LIMIT 100`,
  )
    .bind(now)
    .all<NotificationOutboxRow>();
  for (const item of due.results ?? []) {
    const claimed = await env.DB.prepare(
      "UPDATE notification_outbox SET status='processing', attempts=attempts+1, available_at=? WHERE id=? AND available_at <= ? AND status IN ('pending', 'processing')",
    )
      .bind(leaseUntil, item.id, now)
      .run();
    if (!claimed.success || !claimed.meta.changes) continue;
    try {
      const tokens = await env.DB.prepare(
        "SELECT token FROM mobile_push_tokens WHERE active=1 AND (user_id=? OR (user_id IS NULL AND lower(user_email)=lower(?)))",
      )
        .bind(item.user_id, item.user_email)
        .all<{ token: string }>();
      const rows = tokens.results ?? [];
      if (rows.length) {
        for (let index = 0; index < rows.length; index += 100) {
          const batch = rows.slice(index, index + 100);
          const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
            },
            body: JSON.stringify(
              batch.map(({ token }) => ({
                to: token,
                sound: "default",
                title: item.title,
                body: item.message,
                data: { href: item.href },
              })),
            ),
            signal: AbortSignal.timeout(5_000),
          });
          if (!response.ok)
            throw new Error(`Expo push delivery returned ${response.status}.`);
          const payload = (await response.json().catch(() => null)) as {
            data?: Array<{ details?: { error?: string } }>;
          } | null;
          const invalid = batch
            .filter(
              (_, tokenIndex) =>
                payload?.data?.[tokenIndex]?.details?.error ===
                "DeviceNotRegistered",
            )
            .map(({ token }) => token);
          if (invalid.length) {
            await env.DB.prepare(
              `UPDATE mobile_push_tokens SET active=0, updated_at=?
                 WHERE token IN (${invalid.map(() => "?").join(",")})`,
            )
              .bind(new Date().toISOString(), ...invalid)
              .run();
          }
        }
      }
      await env.DB.prepare(
        "UPDATE notification_outbox SET status='sent', sent_at=?, last_error='' WHERE id=? AND status='processing'",
      )
        .bind(new Date().toISOString(), item.id)
        .run();
    } catch (error) {
      const attempts = item.attempts + 1;
      const retry = attempts < 5;
      const nextAt = new Date(
        Date.now() + Math.min(60 * 60_000, 2 ** attempts * 30_000),
      ).toISOString();
      await env.DB.prepare(
        "UPDATE notification_outbox SET status=?, available_at=?, last_error=?, sent_at=NULL WHERE id=? AND status='processing'",
      )
        .bind(
          retry ? "pending" : "failed",
          nextAt,
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Push delivery failed.",
          item.id,
        )
        .run();
      if (!retry) {
        console.error(
          JSON.stringify({
            event: "notification_outbox_failed",
            outboxId: item.id,
            attempts,
          }),
        );
      }
    }
  }
}

function getRequestId(request: Request) {
  const incoming = request.headers.get("x-request-id")?.trim();
  if (incoming && /^[A-Za-z0-9._:-]{1,96}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

const GOOGLE_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const AUTH_RATE_WINDOW_MS = 60_000;
const AUTH_RATE_LIMIT = 60;
const authRateBuckets = new Map<string, { count: number; resetAt: number }>();

async function isRateLimitedAuthRequest(request: Request, url: URL, env: Env) {
  const sensitivePath =
    url.pathname === "/api/auth/start/google" ||
    url.pathname === "/api/v1/auth/authorize" ||
    url.pathname === "/api/v1/auth/token";
  if (!sensitivePath) return false;
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const key = `${ip}:${url.pathname}`;
  const now = Date.now();
  const windowStart =
    Math.floor(now / AUTH_RATE_WINDOW_MS) * AUTH_RATE_WINDOW_MS;
  const resetAt = new Date(windowStart + AUTH_RATE_WINDOW_MS).toISOString();
  const updatedAt = new Date(now).toISOString();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO auth_rate_limits (bucket_key, count, reset_at, updated_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET
         count = CASE WHEN auth_rate_limits.reset_at <= ? THEN 1 ELSE auth_rate_limits.count + 1 END,
         reset_at = CASE WHEN auth_rate_limits.reset_at <= ? THEN excluded.reset_at ELSE auth_rate_limits.reset_at END,
         updated_at = excluded.updated_at
       RETURNING count`,
    )
      .bind(key, resetAt, updatedAt, updatedAt, updatedAt)
      .first<{ count: number }>();
    return Number(row?.count ?? 0) > AUTH_RATE_LIMIT;
  } catch {
    // Keep a bounded per-isolate fallback while an older deployment is being
    // migrated. New deployments use the globally shared D1 bucket above.
    return isMemoryRateLimitedAuthRequest(request, url, now);
  }
}

function isMemoryRateLimitedAuthRequest(
  request: Request,
  url: URL,
  now = Date.now(),
) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const key = `${ip}:${url.pathname}`;
  const current = authRateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    authRateBuckets.set(key, {
      count: 1,
      resetAt: now + AUTH_RATE_WINDOW_MS,
    });
    if (authRateBuckets.size > 5_000) {
      for (const [bucketKey, bucket] of authRateBuckets) {
        if (bucket.resetAt <= now) authRateBuckets.delete(bucketKey);
      }
    }
    return false;
  }
  current.count += 1;
  return current.count > AUTH_RATE_LIMIT;
}

function isRejectedBrowserMutation(
  request: Request,
  url: URL,
  isClientApi: boolean,
) {
  if (
    isClientApi ||
    !["POST", "PUT", "PATCH", "DELETE"].includes(request.method)
  ) {
    return false;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== url.origin);
}

async function getValidGoogleSession(request: Request, env: Env) {
  const token = cookieValue(
    request.headers.get("cookie") ?? "",
    "incora_google_session",
  );
  if (!token || !env.AUTH_SECRET) return false;

  try {
    const secret = new TextEncoder().encode(env.AUTH_SECRET);
    const signingKey = new Uint8Array(
      await crypto.subtle.digest("SHA-256", secret),
    );
    const { payload } = await jwtVerify(token, signingKey, {
      audience: "incora-session",
      issuer: "incora-people",
    });
    const now = Math.floor(Date.now() / 1000);
    const hasEmail = typeof payload.email === "string";
    if (
      !hasEmail ||
      typeof payload.iat !== "number" ||
      typeof payload.uid !== "number" ||
      typeof payload.sid !== "string" ||
      typeof payload.sub !== "string" ||
      payload.iat + GOOGLE_SESSION_MAX_AGE_SECONDS < now
    ) {
      return false;
    }
    const account = await env.DB.prepare(
      `SELECT ws.id
           FROM web_sessions ws
           JOIN users u ON u.id = ws.user_id
           LEFT JOIN employees e ON e.id = u.employee_id
          WHERE ws.id = ?
            AND ws.user_id = ?
            AND ws.provider_subject = ?
            AND lower(u.email) = lower(?)
            AND ws.revoked_at IS NULL
            AND ws.expires_at > ?
            AND u.enabled = 1
            AND (e.status IS NULL OR e.status <> 'inactive')
          LIMIT 1`,
    )
      .bind(
        payload.sid,
        payload.uid,
        payload.sub,
        payload.email,
        new Date().toISOString(),
      )
      .first();
    return account ? { userId: payload.uid, sessionId: payload.sid } : null;
  } catch {
    return null;
  }
}

function cookieValue(header: string, name: string) {
  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function clientCorsHeaders(origin: string) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers":
      "authorization, content-type, idempotency-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    vary: "origin",
  };
}

function validExtensionOrigin(extensionId: string | undefined) {
  const normalized = extensionId?.trim().toLowerCase() ?? "";
  return /^[a-p]{32}$/.test(normalized)
    ? `chrome-extension://${normalized}`
    : null;
}

export default worker;
