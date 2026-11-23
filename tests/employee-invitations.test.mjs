import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildEmployeeInvitationPayload,
  getInvitationLoginActivity,
  invitationEligibilityCode,
  isValidInvitationSender,
  parseInvitationPublicOrigin,
} from "../modules/invitations/domain.ts";
import { sendInvitationEmail } from "../modules/invitations/provider.ts";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

const employee = {
  id: 42,
  firstName: "Synthetic",
  email: "synthetic.employee@example.test",
  status: "active",
};

function account(overrides = {}) {
  return {
    id: 17,
    email: employee.email,
    role: "employee",
    enabled: true,
    employeeId: employee.id,
    protectedAdmin: false,
    ...overrides,
  };
}

test("invitation eligibility requires one matching enabled employee account", () => {
  assert.equal(
    invitationEligibilityCode({ employee, accounts: [account()] }),
    null,
  );
  assert.equal(
    invitationEligibilityCode({
      employee,
      accounts: [account({ role: "manager" })],
    }),
    null,
  );
  assert.equal(
    invitationEligibilityCode({
      employee,
      accounts: [account({ role: "hr_admin" })],
    }),
    null,
  );
  assert.equal(
    invitationEligibilityCode({
      employee,
      accounts: [account({ enabled: false })],
    }),
    "account_disabled",
  );
  assert.equal(
    invitationEligibilityCode({
      employee: { ...employee, status: "inactive" },
      accounts: [account()],
    }),
    "employee_terminated",
  );
  assert.equal(
    invitationEligibilityCode({
      employee,
      accounts: [account({ email: "other@example.test" })],
    }),
    "email_mismatch",
  );
  assert.equal(
    invitationEligibilityCode({
      employee,
      accounts: [account({ employeeId: 99 })],
    }),
    "email_mismatch",
  );
  assert.equal(
    invitationEligibilityCode({
      employee,
      accounts: [account({ role: "super_admin" })],
    }),
    "system_account",
  );
  assert.equal(
    invitationEligibilityCode({
      employee,
      accounts: [account({ protectedAdmin: true })],
    }),
    "system_account",
  );
  assert.equal(
    invitationEligibilityCode({
      employee,
      accounts: [account(), account({ id: 18 })],
    }),
    "identity_ambiguous",
  );
  assert.equal(
    invitationEligibilityCode({ employee: null, accounts: [] }),
    "employee_missing",
  );
});

test("invitation login URL must be a configured canonical application origin", () => {
  assert.equal(
    parseInvitationPublicOrigin(
      "https://people.incora.example.com/",
      "protected",
    ),
    "https://people.incora.example.com",
  );
  for (const unsafe of [
    "http://people.incora.example.com",
    "https://localhost",
    "https://preview.localhost",
    "https://127.0.0.1",
    "https://people.example.test",
    "https://people.example.invalid",
    "https://user:password@people.incora.example.com",
    "https://people.incora.example.com/?next=https://evil.test",
    "https://people.incora.example.com/path",
    "not-a-url",
  ]) {
    assert.equal(
      parseInvitationPublicOrigin(unsafe, "protected"),
      null,
      unsafe,
    );
  }
  assert.equal(
    parseInvitationPublicOrigin("http://127.0.0.1:3000", "demo"),
    "http://127.0.0.1:3000",
  );
});

test("sender validation rejects malformed addresses and header injection", () => {
  assert.equal(isValidInvitationSender("people@incora.example.com"), true);
  assert.equal(
    isValidInvitationSender("INCORA People <people@incora.example.com>"),
    true,
  );
  assert.equal(isValidInvitationSender("not-an-email"), false);
  assert.equal(
    isValidInvitationSender(
      "INCORA\r\nBcc: attacker@example.test <people@incora.example.com>",
    ),
    false,
  );
});

test("email template is localized, escaped and uses only the normal Google OAuth URL", () => {
  const uk = buildEmployeeInvitationPayload({
    from: "INCORA People <people@incora.example.com>",
    firstName: "Аня <script>alert(1)</script>",
    email: employee.email,
    locale: "uk",
    publicOrigin: "https://people.incora.example.com",
  });
  assert.equal(uk.subject, "Запрошення до INCORA People");
  assert.equal(uk.to[0], employee.email);
  assert.match(uk.html, /&lt;script&gt;/);
  assert.doesNotMatch(uk.html, /<script>/);
  assert.match(
    uk.html,
    /https:\/\/people\.incora\.example\.com\/api\/auth\/google\?returnTo=%2F/,
  );
  assert.equal((uk.html.match(/<a\b/g) ?? []).length, 1);
  assert.ok(uk.text.startsWith("Привіт, Аня <script>alert(1)</script>!"));
  assert.match(uk.html, /Привіт, Аня &lt;script&gt;/);
  for (const part of [
    "Тебе запрошено до INCORA People — внутрішньої HR-системи INCORA.",
    "Щоб почати, натисни кнопку нижче та увійди через Google з акаунта, на який отримав цей лист.",
    "Якщо виникнуть питання з доступом, звернися до HR.",
  ]) {
    assert.ok(uk.text.includes(part));
    assert.ok(uk.html.includes(part));
  }
  assert.doesNotMatch(uk.html + uk.text, /робоч[ауої] адрес|TEST —/i);
  assert.doesNotMatch(
    `${uk.html}${uk.text}`,
    /password|temporary credential|token/i,
  );

  const en = buildEmployeeInvitationPayload({
    from: "people@incora.example.com",
    firstName: "Alex",
    email: employee.email,
    locale: "en",
    publicOrigin: "https://people.incora.example.com",
  });
  assert.equal(en.subject, "You're invited to INCORA People");
  assert.match(en.text, /^Hi, Alex!/);
  assert.match(en.text, /Google account that received this email/);
  assert.match(en.html, /If you have any questions about access, contact HR\./);
  assert.doesNotMatch(en.html + en.text, /work email|TEST —/i);
});

test("invitation provider uses the same idempotency key and distinguishes acceptance from delivery", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "provider-message-1" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };
  const payload = buildEmployeeInvitationPayload({
    from: "people@incora.example.com",
    firstName: "Synthetic",
    email: employee.email,
    locale: "uk",
    publicOrigin: "https://people.incora.example.com",
  });
  const input = { attemptId: "c6d8f14b-6868-4780-bb04-0ab32ad149d2", payload };
  const config = { enabled: true, apiKey: "test_only_fake_key" };
  const first = await sendInvitationEmail(input, config, fetcher);
  const retry = await sendInvitationEmail(input, config, fetcher);
  const resend = await sendInvitationEmail(
    { ...input, attemptId: "e404f45b-9768-42c8-8bfb-7d999783f91a" },
    config,
    fetcher,
  );
  assert.deepEqual(first, {
    kind: "accepted",
    messageId: "provider-message-1",
  });
  assert.deepEqual(retry, first);
  assert.deepEqual(resend, first);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers["idempotency-key"], input.attemptId);
  assert.equal(calls[1].init.headers["idempotency-key"], input.attemptId);
  assert.notEqual(
    calls[2].init.headers["idempotency-key"],
    calls[1].init.headers["idempotency-key"],
    "a deliberate resend is a distinct attempt while recovery reuses its key",
  );
  assert.equal(
    calls[0].init.headers.authorization,
    "Bearer test_only_fake_key",
  );
  assert.equal(JSON.parse(calls[0].init.body).to[0], employee.email);
});

test("provider rejects definitive failures but treats timeout, conflict and server errors as uncertain", async () => {
  const input = {
    attemptId: "c6d8f14b-6868-4780-bb04-0ab32ad149d2",
    payload: {
      from: "people@incora.example.com",
      to: [employee.email],
      subject: "test",
      html: "",
      text: "",
    },
  };
  const config = { enabled: true, apiKey: "test_only_fake_key" };
  const reply = (status) => async () => new Response("{}", { status });
  assert.deepEqual(await sendInvitationEmail(input, config, reply(401)), {
    kind: "rejected",
    failureCode: "provider_authentication",
  });
  assert.deepEqual(await sendInvitationEmail(input, config, reply(429)), {
    kind: "rejected",
    failureCode: "provider_rate_limit",
  });
  assert.deepEqual(await sendInvitationEmail(input, config, reply(409)), {
    kind: "uncertain",
    failureCode: "provider_idempotency_in_progress",
  });
  assert.deepEqual(await sendInvitationEmail(input, config, reply(503)), {
    kind: "uncertain",
    failureCode: "provider_temporary_error",
  });
  assert.deepEqual(
    await sendInvitationEmail(input, config, async () => {
      throw new Error("synthetic timeout");
    }),
    { kind: "uncertain", failureCode: "provider_outcome_unknown" },
  );
  assert.deepEqual(
    await sendInvitationEmail(input, { enabled: false, apiKey: "" }),
    { kind: "rejected", failureCode: "provider_not_configured" },
  );
});

test("historical login activity is never fabricated for accounts predating tracking", () => {
  assert.equal(
    getInvitationLoginActivity({ lastLoginAt: null, accountCreatedAt: null }),
    "unknown",
  );
  assert.equal(
    getInvitationLoginActivity({
      lastLoginAt: null,
      accountCreatedAt: "2026-11-10T10:00:00.000Z",
    }),
    "not_logged_in",
  );
  assert.equal(
    getInvitationLoginActivity({
      lastLoginAt: "2026-11-10T12:00:00.000Z",
      accountCreatedAt: null,
    }),
    "logged_in",
  );
});

test("server routes enforce HR authorization, preview denial and account-owned email", async () => {
  const [route, commands, queries, createEmployee, profile] = await Promise.all(
    [
      source("app/api/employees/[id]/invitation/route.ts"),
      source("modules/invitations/commands.ts"),
      source("modules/invitations/queries.ts"),
      source("components/EmployeeDirectory.tsx"),
      source("app/employees/[id]/page.tsx"),
    ],
  );
  assert.match(route, /access\.managePeople/);
  assert.match(route, /actor\.isPreview\s*\|\|\s*!actor\.userId/);
  assert.match(route, /cache-control": "private, no-store"/);
  assert.match(commands, /input\.actor\.isPreview/);
  assert.match(commands, /account\.email/);
  assert.match(commands, /lower\(trim\(employee\.email\)\)/);
  assert.match(commands, /status IN \('sending','uncertain'\)/);
  assert.match(commands, /MAX_ATTEMPTS_PER_HOUR/);
  assert.match(commands, /SAFE_PROVIDER_RETRY_MS/);
  assert.match(commands, /employee\.invitation_requested/);
  assert.match(commands, /employee\.invitation_accepted/);
  assert.match(commands, /employee\.invitation_failed/);
  assert.match(queries, /protectedAdminAccounts/);
  assert.match(queries, /recentAttempts/);
  assert.match(createEmployee, /setCreatedEmployee\(result\.employee\)/);
  assert.match(
    profile,
    /canManageInvitations=\{access\.managePeople && !isPreview\}/,
  );
  assert.doesNotMatch(route, /request\.(?:json|text).*email/i);
});

test("runtime and Drizzle invitation migrations stay in sync", async () => {
  const [runtimeMigration, drizzleMigration] = await Promise.all([
    source("migrations/0071_employee_invitations.sql"),
    source("drizzle/0074_employee_invitations.sql"),
  ]);
  const normalize = (sql) =>
    sql
      .replace(/^\s*--.*$/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  assert.equal(normalize(runtimeMigration), normalize(drizzleMigration));
});

test("Google OAuth records successful login only after account admission and does not alter refresh semantics", async () => {
  const [google, clientAuth, vite, config] = await Promise.all([
    source("lib/google-auth.ts"),
    source("lib/client-auth.ts"),
    source("vite.config.ts"),
    source("lib/runtime-config.ts"),
  ]);
  assert.match(google, /findAdmittedAccount\(email, subject\)/);
  assert.match(
    google,
    /\.update\(users\)[\s\S]*?\.set\(\{\s*lastLoginAt: now\.toISOString\(\)\s*\}\)/,
  );
  assert.match(clientAuth, /recordLogin: true/);
  assert.match(
    clientAuth,
    /if \(input\.recordLogin && session\.userId !== null\)/,
  );
  const refresh = clientAuth.match(
    /export async function refreshClientSession[\s\S]*?(?=\nasync function createClientSession)/,
  )?.[0];
  assert.ok(refresh);
  assert.doesNotMatch(refresh, /lastLoginAt|recordLogin/);
  assert.doesNotMatch(vite, /EMPLOYEE_INVITATIONS_ENABLED\s*:/);
  assert.doesNotMatch(vite, /INVITATION_FROM_EMAIL\s*:/);
  assert.doesNotMatch(vite, /RESEND_API_KEY\s*:/);
  assert.match(config, /RESEND_API_KEY\?: string/);
  assert.match(config, /googleLoginConfigured/);
  assert.match(config, /environment\.AUTH_PROVIDER === "google"/);
});
