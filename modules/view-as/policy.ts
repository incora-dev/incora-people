export type PreviewActor = {
  userId: number | null;
  role: string;
};

export type PreviewTarget = {
  userId: number;
  employeeId: number;
  email: string;
  employeeEmail: string;
  role: string;
  enabled: boolean;
  protectedAdmin: boolean;
  employeeStatus: string;
};

export function isEligiblePreviewActor(actor: PreviewActor) {
  return actor.userId !== null && actor.role === "super_admin";
}

export function isEligiblePreviewTarget(target: PreviewTarget) {
  const targetEmail = normalizeIdentity(target.email);
  const employeeEmail = normalizeIdentity(target.employeeEmail);
  return (
    target.userId > 0 &&
    target.employeeId > 0 &&
    target.role !== "super_admin" &&
    target.enabled &&
    !target.protectedAdmin &&
    ["active", "on_leave"].includes(target.employeeStatus) &&
    targetEmail.length > 0 &&
    targetEmail === employeeEmail
  );
}

export function normalizeIdentity(value: string) {
  return value.trim().toLowerCase();
}

export type PreviewRequestDecision =
  "allow" | "deny" | "redirect-unavailable" | "redirect-expired";

const supportedPages = [
  /^\/$/,
  /^\/employees$/,
  /^\/employees\/\d+$/,
  /^\/org$/,
  /^\/(leave|calendar|time|expenses|tasks|one-on-one|inventory|documents|assets)$/,
  /^\/announcements\/\d+$/,
];

const safeReadApis = [
  /^\/api\/me$/,
  /^\/api\/notifications$/,
  /^\/api\/preferences$/,
  /^\/api\/search$/,
  /^\/api\/employees$/,
  /^\/api\/employees\/\d+$/,
  /^\/api\/employees\/\d+\/profile-records$/,
  /^\/api\/employees\/\d+\/documents$/,
  /^\/api\/employees\/\d+\/compensations$/,
  /^\/api\/inventory$/,
  /^\/api\/reimbursements$/,
  /^\/api\/time\/status$/,
  /^\/api\/time\/entries$/,
  /^\/api\/work-mode$/,
];

function isStaticRead(pathname: string) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_vinext/static/") ||
    pathname.startsWith("/assets/") ||
    [
      "/favicon.svg",
      "/manifest.webmanifest",
      "/apple-touch-icon.png",
      "/pwa-icon-192.png",
      "/pwa-icon-512.png",
      "/pwa-icon-maskable-512.png",
      "/incora-logo.png",
      "/og.png",
    ].includes(pathname)
  );
}

export function decidePreviewRequest(input: {
  method: string;
  pathname: string;
  expired?: boolean;
}): PreviewRequestDecision {
  const method = input.method.toUpperCase();
  // Vinext/React Router requests server-rendered route data from a sibling
  // `.rsc` path during client navigation (for example `/leave.rsc`). Treat
  // those as the corresponding page read, while keeping the same explicit
  // allowlist so unsupported routes remain unavailable in preview mode.
  const pathname =
    !input.pathname.startsWith("/api/") && input.pathname.endsWith(".rsc")
      ? input.pathname.slice(0, -4) || "/"
      : input.pathname;
  const expired = input.expired === true;

  if (method === "POST" && pathname === "/api/view-as/exit") return "allow";
  if (method === "GET" || method === "HEAD") {
    if (isStaticRead(pathname)) return "allow";
    if (expired) {
      if (pathname === "/view-as-expired") return "allow";
      return pathname.startsWith("/api/") ? "deny" : "redirect-expired";
    }
    if (pathname === "/view-as-unavailable") return "allow";
    if (supportedPages.some((pattern) => pattern.test(pathname))) {
      return "allow";
    }
    if (safeReadApis.some((pattern) => pattern.test(pathname))) {
      return "allow";
    }
    if (pathname.startsWith("/api/")) return "deny";
    return "redirect-unavailable";
  }
  return "deny";
}
