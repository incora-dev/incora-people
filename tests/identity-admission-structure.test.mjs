import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("fails closed for unknown, disabled and terminated identities", async () => {
  const [identity, auth, google, worker, migration, policy] = await Promise.all(
    [
      source("lib/identity.ts"),
      source("lib/auth.ts"),
      source("lib/google-auth.ts"),
      source("worker/index.ts"),
      source("migrations/0050_identity_admission_and_offboarding.sql"),
      source("modules/people/identity-policy.ts"),
    ],
  );

  assert.match(identity, /!isLoginAccountEligible\(row\)/);
  assert.match(
    policy,
    /account\.enabled && account\.employeeStatus !== "inactive"/,
  );
  assert.match(auth, /This account is not provisioned or is disabled/);
  assert.doesNotMatch(auth, /role: "employee", employeeId: null/);
  assert.match(google, /webSessions/);
  assert.match(google, /findAdmittedAccountById/);
  assert.match(worker, /ws\.revoked_at IS NULL/);
  assert.match(worker, /u\.enabled = 1/);
  assert.match(worker, /e\.status IS NULL OR e\.status <> 'inactive'/);
  assert.match(migration, /CREATE TABLE web_sessions/);
  assert.match(migration, /ALTER TABLE users ADD COLUMN enabled/);
});

test("Google login resolves one exact normalized email without a domain gate", async () => {
  const [identity, google, policy] = await Promise.all([
    source("lib/identity.ts"),
    source("lib/google-auth.ts"),
    source("modules/people/identity-policy.ts"),
  ]);
  assert.match(identity, /lower\(trim\(\$\{users\.email\}\)\)/);
  assert.match(identity, /uniqueNormalizedEmailMatch\(normalizedEmail, rows\)/);
  assert.match(identity, /return email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(google, /normalizeVerifiedGoogleIdentity\(\{/);
  assert.match(google, /findAdmittedAccount\(email, subject\)/);
  assert.match(policy, /input\.email_verified !== true/);
  assert.match(
    policy,
    /normalizeEmailValue\(candidate\.email\) === normalizedEmail/,
  );
  assert.doesNotMatch(google, /ALLOWED_EMAIL_DOMAIN|allowedDomain/);
});

test("employee access disable requires reauthentication and revokes sessions", async () => {
  const [route, policy] = await Promise.all([
    source("app/api/employees/[id]/account-access/route.ts"),
    source("modules/people/identity-policy.ts"),
  ]);
  assert.match(route, /canManageSystemAccess\(/);
  assert.match(policy, /role === "super_admin" && manageSettings/);
  assert.match(route, /hasRecentAuthentication\(actor\)/);
  assert.match(route, /isSelfAccount\(actor\.userId, account\.id\)/);
  assert.match(route, /isProtectedSuperAdminUserId\(account\.id\)/);
  assert.match(route, /accountAccessRevocationStatements\(account\.id, now\)/);
  assert.match(policy, /UPDATE web_sessions SET revoked_at/);
  assert.match(policy, /UPDATE client_sessions SET revoked_at/);
  assert.match(policy, /UPDATE client_session_refresh_tokens SET revoked_at/);
  assert.match(route, /user\.access_disabled/);
  assert.match(route, /employee\.status === "inactive"/);
});

test("login email normalization is enforced by the schema migration mirrors", async () => {
  const [schema, migration, drizzle] = await Promise.all([
    source("db/schema.ts"),
    source("migrations/0067_normalized_login_email_unique.sql"),
    source("drizzle/0070_normalized_login_email_unique.sql"),
  ]);
  assert.match(schema, /employees_normalized_email_uq/);
  assert.match(schema, /users_normalized_email_uq/);
  assert.match(migration, /ON employees\(lower\(trim\(email\)\)\)/);
  assert.match(migration, /ON users\(lower\(trim\(email\)\)\)/);
  assert.equal(
    migration.replace(/\s+/g, " ").trim().split(";").length,
    drizzle.replace(/\s+/g, " ").trim().split(";").length,
  );
});

test("binds protected administrators to immutable account ids", async () => {
  const [schema, auth, settings, migration] = await Promise.all([
    source("db/schema.ts"),
    source("lib/auth.ts"),
    source("app/api/admin/system-settings/route.ts"),
    source("migrations/0056_immutable_protected_admins.sql"),
  ]);
  assert.match(schema, /protectedAdminAccounts/);
  assert.match(auth, /protectedAdminAccounts\.userId/);
  assert.doesNotMatch(auth, /getProtectedSuperAdminEmails/);
  assert.match(settings, /DELETE FROM protected_admin_accounts/);
  assert.match(settings, /json_each/);
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS protected_admin_accounts/,
  );
  assert.match(migration, /protected_admin_email_change/);
  assert.match(migration, /protected_admin_demote/);
  assert.match(migration, /protected_admin_delete/);
});

test("offboarding revokes sessions, push tokens and open time state atomically", async () => {
  const [lifecycle, employeeRoute, timeCommands] = await Promise.all([
    source("modules/people/lifecycle.ts"),
    source("app/api/employees/[id]/route.ts"),
    source("modules/time/client-commands.ts"),
  ]);

  assert.match(lifecycle, /UPDATE users SET enabled=0/);
  assert.match(lifecycle, /UPDATE web_sessions SET revoked_at/);
  assert.match(lifecycle, /UPDATE client_sessions SET revoked_at/);
  assert.match(lifecycle, /DELETE FROM mobile_push_tokens/);
  assert.match(lifecycle, /UPDATE break_entries SET ended_at/);
  assert.match(lifecycle, /UPDATE time_entries SET clock_out/);
  assert.match(lifecycle, /status='withdrawn'/);
  assert.match(employeeRoute, /Use the termination workflow/);
  assert.match(timeCommands, /employee\.status === "inactive"/);
});

test("restricts sensitive account and policy administration to super administrators", async () => {
  const [backup, users, access, mobileUsers, mobileAccess] = await Promise.all([
    source("app/api/admin/backup/route.ts"),
    source("app/api/admin/users/[id]/route.ts"),
    source("app/api/admin/access-policies/[id]/route.ts"),
    source("app/api/v1/admin/users/[id]/route.ts"),
    source("app/api/v1/admin/access/[id]/route.ts"),
  ]);

  assert.match(backup, /user\.role !== "super_admin"/);
  assert.match(users, /actor\.role !== "super_admin"/);
  assert.match(access, /user\.role !== "super_admin"/);
  assert.match(mobileUsers, /client\.user\.role !== "super_admin"/);
  assert.match(mobileAccess, /client\.user\.role !== "super_admin"/);
  assert.match(backup, /hasRecentAuthentication/);
  assert.match(users, /recentAuthenticationResponse/);
  assert.match(access, /manageSettings: current\.role === "hr_admin"/);
  assert.match(mobileAccess, /manageSettings: current\.role === "hr_admin"/);
});

test("does not treat stale Cloudflare Access tokens as recent authentication", async () => {
  const auth = await source("lib/auth.ts");
  assert.match(auth, /payload\.auth_time/);
  assert.match(auth, /payload\.iat/);
  assert.match(auth, /authenticatedAt: new Date\(authTimestamp \* 1000\)/);
  assert.match(auth, /getAppMode\(\) === "demo"/);
  assert.match(auth, /cdn-cgi\/access\/login/);
  assert.doesNotMatch(auth, /getAuthProvider\(\) !== "google"\) return true/);
});

test("validates schedule defaults before changing system settings", async () => {
  const settings = await source("app/api/admin/system-settings/route.ts");
  assert.match(settings, /validateScheduleDefaults/);
  assert.match(settings, /Work days must not contain duplicates/);
  assert.match(settings, /End time must be later than start time/);
  assert.match(
    settings,
    /Break must be shorter than the scheduled work interval/,
  );
});

test("tracks client refresh-token families and durable auth throttling", async () => {
  const [schema, clientAuth, worker, migration] = await Promise.all([
    source("db/schema.ts"),
    source("lib/client-auth.ts"),
    source("worker/index.ts"),
    source("migrations/0052_refresh_token_replay_and_rate_limit.sql"),
  ]);
  assert.match(schema, /clientSessionRefreshTokens/);
  assert.match(schema, /authRateLimits/);
  assert.match(clientAuth, /revokeRefreshTokenFamily/);
  assert.match(clientAuth, /clientSessionRefreshTokens\.tokenHash/);
  assert.match(clientAuth, /usedAt: now/);
  assert.match(worker, /INSERT INTO auth_rate_limits/);
  assert.match(migration, /client_session_refresh_tokens/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS auth_rate_limits/);
});

test("queues push delivery with deterministic deduplication and retries", async () => {
  const [schema, outbox, push, worker, migration] = await Promise.all([
    source("db/schema.ts"),
    source("modules/notifications/outbox.ts"),
    source("modules/notifications/push.ts"),
    source("worker/index.ts"),
    source("migrations/0053_notification_outbox.sql"),
  ]);
  assert.match(schema, /notificationOutbox/);
  assert.match(outbox, /ON CONFLICT\(dedupe_key\) DO NOTHING/);
  assert.match(push, /enqueuePushNotifications/);
  assert.match(worker, /processNotificationOutbox/);
  assert.match(worker, /status='processing'/);
  assert.match(worker, /status IN \('pending', 'processing'\)/);
  assert.match(worker, /leaseUntil/);
  assert.match(worker, /attempts < 5/);
  assert.match(migration, /notification_outbox/);
});

test("binds user-owned activity to immutable ids and exposes request tracing", async () => {
  const [schema, migration, worker, notifications, dashboard] =
    await Promise.all([
      source("db/schema.ts"),
      source("migrations/0060_immutable_user_ownership.sql"),
      source("worker/index.ts"),
      source("modules/notifications/queries.ts"),
      source("modules/dashboard/queries.ts"),
    ]);
  assert.match(schema, /userId: integer\("user_id"\)/);
  assert.match(schema, /reporterUserId: integer\("reporter_user_id"\)/);
  assert.match(migration, /UPDATE announcement_comments/);
  assert.match(migration, /notifications_fill_user_id/);
  assert.match(migration, /CREATE INDEX notification_outbox_user_id_idx/);
  assert.match(worker, /x-request-id/);
  assert.match(worker, /event: "request.error"/);
  assert.match(notifications, /notifications\.userId/);
  assert.match(dashboard, /announcementDismissals\.userId/);
});

test("protects create workflows from client retries", async () => {
  const [schema, reimbursement, leave, timeWeb, timeMobile, migration] =
    await Promise.all([
      source("db/schema.ts"),
      source("modules/reimbursements/commands.ts"),
      source("modules/leave/commands.ts"),
      source("app/api/time/entries/route.ts"),
      source("app/api/v1/time/manual/route.ts"),
      source("migrations/0054_idempotent_create_commands.sql"),
    ]);
  assert.match(schema, /idempotencyKey/);
  assert.match(reimbursement, /reimbursementRequests\.idempotencyKey/);
  assert.match(leave, /leaveRequests\.idempotencyKey/);
  assert.match(timeWeb, /idempotency-key/);
  assert.match(timeMobile, /idempotency-key/);
  assert.match(migration, /employee_idempotency_unique/);
});
