import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  decidePreviewRequest,
  isEligiblePreviewActor,
  isEligiblePreviewTarget,
} from "../modules/view-as/policy.ts";
import { canViewInactiveEmployees } from "../modules/people/directory.ts";
import { translate } from "../lib/i18n.ts";

const root = new URL("../", import.meta.url);
const employeeTarget = {
  userId: 12,
  employeeId: 34,
  email: " Viewer@Example.Test ",
  employeeEmail: "viewer@example.test",
  role: "employee",
  enabled: true,
  protectedAdmin: false,
  employeeStatus: "active",
};

test("only the authenticated Super Admin role is an eligible preview actor", () => {
  assert.equal(
    isEligiblePreviewActor({ userId: 1, role: "super_admin" }),
    true,
  );
  assert.equal(isEligiblePreviewActor({ userId: 1, role: "hr_admin" }), false);
  assert.equal(isEligiblePreviewActor({ userId: 1, role: "employee" }), false);
  assert.equal(
    isEligiblePreviewActor({ userId: null, role: "super_admin" }),
    false,
  );
});

test("expired preview explanation reuses the Ukrainian localized exit message", () => {
  assert.equal(
    translate(
      "uk",
      "Exit preview to return to the original administrator screen.",
    ),
    "Завершіть перегляд, щоб повернутися до початкового екрана адміністратора.",
  );
});

test("inactive employee discovery follows the same role scope as the directory", () => {
  assert.equal(canViewInactiveEmployees("super_admin"), true);
  assert.equal(canViewInactiveEmployees("hr_admin"), false);
  assert.equal(canViewInactiveEmployees("manager"), false);
  assert.equal(canViewInactiveEmployees("employee"), false);
});

test("preview target must be an enabled, linked, non-protected employee identity", () => {
  assert.equal(isEligiblePreviewTarget(employeeTarget), true);
  assert.equal(
    isEligiblePreviewTarget({ ...employeeTarget, employeeStatus: "on_leave" }),
    true,
  );
  assert.equal(
    isEligiblePreviewTarget({
      ...employeeTarget,
      employeeEmail: "other@example.test",
    }),
    false,
  );
  assert.equal(
    isEligiblePreviewTarget({
      ...employeeTarget,
      email: " ",
      employeeEmail: " ",
    }),
    false,
  );
  assert.equal(
    isEligiblePreviewTarget({ ...employeeTarget, enabled: false }),
    false,
  );
  assert.equal(
    isEligiblePreviewTarget({ ...employeeTarget, employeeStatus: "inactive" }),
    false,
  );
  assert.equal(
    isEligiblePreviewTarget({
      ...employeeTarget,
      employeeStatus: "terminated",
    }),
    false,
  );
  assert.equal(
    isEligiblePreviewTarget({ ...employeeTarget, role: "super_admin" }),
    false,
  );
  assert.equal(
    isEligiblePreviewTarget({ ...employeeTarget, protectedAdmin: true }),
    false,
  );
});

test("preview request policy allows supported reads and denies state-changing or extracting routes", () => {
  for (const pathname of [
    "/",
    "/manifest.webmanifest",
    "/employees",
    "/employees.rsc",
    "/employees/34",
    "/employees/34.rsc",
    "/leave",
    "/leave.rsc",
    "/tasks",
    "/expenses",
    "/one-on-one",
    "/inventory",
    "/documents",
    "/assets",
    "/api/me",
    "/api/employees/34/documents",
    "/api/inventory",
  ]) {
    assert.equal(
      decidePreviewRequest({ method: "GET", pathname }),
      "allow",
      pathname,
    );
  }

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(
      decidePreviewRequest({ method, pathname: "/api/inventory" }),
      "deny",
      `${method} must be blocked in preview`,
    );
  }
  for (const pathname of [
    "/api/files/private-document",
    "/api/employees/export",
    "/api/time/export",
    "/api/auth/logout",
    "/api/bug-reports",
  ]) {
    assert.equal(
      decidePreviewRequest({ method: "GET", pathname }),
      "deny",
      `${pathname} must not extract data or cause side effects`,
    );
  }
  assert.equal(
    decidePreviewRequest({ method: "POST", pathname: "/api/view-as/exit" }),
    "allow",
  );
  assert.equal(
    decidePreviewRequest({ method: "POST", pathname: "/api/view-as" }),
    "deny",
  );
});

test("unsupported and expired preview routes never fall back to administrator pages", () => {
  assert.equal(
    decidePreviewRequest({ method: "GET", pathname: "/settings" }),
    "redirect-unavailable",
  );
  assert.equal(
    decidePreviewRequest({ method: "GET", pathname: "/projects" }),
    "redirect-unavailable",
  );
  assert.equal(
    decidePreviewRequest({ method: "GET", pathname: "/settings.rsc" }),
    "redirect-unavailable",
  );
  assert.equal(
    decidePreviewRequest({ method: "GET", pathname: "/api/inventory.rsc" }),
    "deny",
  );
  assert.equal(
    decidePreviewRequest({
      method: "GET",
      pathname: "/employees",
      expired: true,
    }),
    "redirect-expired",
  );
  assert.equal(
    decidePreviewRequest({ method: "GET", pathname: "/api/me", expired: true }),
    "deny",
  );
  assert.equal(
    decidePreviewRequest({
      method: "POST",
      pathname: "/api/view-as/exit",
      expired: true,
    }),
    "allow",
  );
  assert.equal(
    decidePreviewRequest({
      method: "PATCH",
      pathname: "/api/view-as/exit",
      expired: true,
    }),
    "deny",
  );
});

test("preview UI uses target permissions and exposes a persistent read-only exit", async () => {
  const [
    auth,
    shell,
    worker,
    unavailable,
    actions,
    search,
    profile,
    org,
    engagement,
    startRoute,
    exitRoute,
    peopleQueries,
  ] = await Promise.all(
    [
      "lib/auth.ts",
      "components/AppShell.tsx",
      "worker/index.ts",
      "app/view-as-unavailable/page.tsx",
      "components/EmployeeProfileActions.tsx",
      "app/api/search/route.ts",
      "app/employees/[id]/page.tsx",
      "app/org/page.tsx",
      "components/home/AnnouncementEngagement.tsx",
      "app/api/view-as/route.ts",
      "app/api/view-as/exit/route.ts",
      "modules/people/queries.ts",
    ].map((path) => readFile(new URL(path, root), "utf8")),
  );
  assert.match(auth, /resolvePreviewSession\(/);
  assert.match(auth, /userId: preview\.targetUserId/);
  assert.match(auth, /role: preview\.targetRole/);
  assert.match(
    auth,
    /if \(preview\?\.state === "expired"\)\s*\{\s*redirect\("\/view-as-expired"\)/,
  );
  assert.match(worker, /decidePreviewRequest\(/);
  assert.match(worker, /cache-control.*private, no-store/);
  assert.match(shell, /view-as-banner/);
  assert.match(shell, /api\/view-as\/exit/);
  assert.match(
    shell,
    /setPreviewInfo\(null\);\s*setSession\(null\);\s*window\.location\.assign\(result\.returnPath \?\? "\/employees"\)/,
  );
  assert.match(
    shell,
    /fetch\("\/api\/me"\)[\s\S]*?response\.ok[\s\S]*?if \(!data\) return;[\s\S]*?setPreviewInfo\(data\.preview \?\? null\)/,
  );
  assert.match(
    shell,
    /async function markNotificationRead\(id: number\) \{\s*if \(previewMode\) return;/,
  );
  assert.match(shell, /Read-only preview/);
  assert.match(actions, /View as employee/);
  assert.match(search, /canViewInactiveEmployees\(user\.role\)/);
  assert.match(search, /ne\(employees\.status, "inactive"\)/);
  assert.match(startRoute, /getGoogleSessionIdentity\(/);
  assert.match(startRoute, /hasRecentAuthentication\(actor\)/);
  assert.match(exitRoute, /endEmployeePreview\(/);
  assert.match(worker, /trustedHeaders\.delete\(header\)/);
  assert.match(profile, /canReadEmployeeSensitiveData\(/);
  assert.match(profile, /canReadEmployeePrivateDetails\(/);
  assert.match(
    profile,
    /canViewPrivateDetails\s*\?\s*getEmployeePrivateDetails\(employee\.id\)/,
  );
  assert.match(
    profile,
    /getEmployee\(\s*employeeId,\s*canReadRequestedEmployeePrivateFields/,
  );
  assert.match(peopleQueries, /personalEmail: includeSensitive[\s\S]*?NULL/);
  assert.match(profile, /canReveal=\{!isPreview\}/);
  assert.match(profile, /const visibleRelationships = isPreview/);
  assert.match(profile, /photoFileId: null/);
  assert.match(org, /photoFileId: null/);
  assert.match(engagement, /if \(readOnlyPreview\) return false/);
  assert.match(engagement, /!readOnlyPreview/);
  assert.match(unavailable, /No administrator data was loaded/);
});
