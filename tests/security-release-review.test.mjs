import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  accountAccessRevocationStatements,
  canManageSystemAccess,
  isLoginAccountEligible,
  isSelfAccount,
  normalizeVerifiedGoogleIdentity,
  uniqueNormalizedEmailMatch,
} from "../modules/people/identity-policy.ts";
import { parseManualDate } from "../modules/people/dates.ts";
import {
  genericProfileStartDateChanged,
  hasEmploymentStateChanged,
} from "../modules/people/employment-profile.ts";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

function resolveLogin(claims, accounts) {
  const identity = normalizeVerifiedGoogleIdentity(claims);
  if (!identity) return null;
  const account = uniqueNormalizedEmailMatch(identity.email, accounts);
  return account && isLoginAccountEligible(account) ? account : null;
}

test("Google admission requires verified claims and one exact normalized account", () => {
  const existing = {
    email: "User@Test.com",
    enabled: true,
    employeeStatus: "active",
  };
  const accounts = [existing];

  assert.equal(
    resolveLogin(
      { email: "user@test.com", email_verified: true, sub: "google-1" },
      accounts,
    ),
    existing,
  );
  assert.equal(
    resolveLogin(
      { email: "  USER@Test.com ", email_verified: true, sub: "google-1" },
      accounts,
    ),
    existing,
  );
  assert.equal(
    resolveLogin(
      {
        email: "unknown@gmail.com",
        email_verified: true,
        sub: "google-2",
      },
      accounts,
    ),
    null,
  );
  assert.equal(
    resolveLogin(
      {
        email: "unknown@incorainc.com",
        email_verified: true,
        sub: "google-3",
      },
      accounts,
    ),
    null,
  );
  assert.equal(
    resolveLogin(
      { email: existing.email, email_verified: false, sub: "google-1" },
      accounts,
    ),
    null,
  );
  assert.equal(
    resolveLogin(
      { email: existing.email, email_verified: true, sub: "google-1" },
      [{ ...existing, enabled: false }],
    ),
    null,
  );
  assert.equal(
    resolveLogin(
      { email: existing.email, email_verified: true, sub: "google-1" },
      [{ ...existing, employeeStatus: "inactive" }],
    ),
    null,
  );
  assert.equal(
    uniqueNormalizedEmailMatch(existing.email, [
      existing,
      { ...existing, email: " user@test.com " },
    ]),
    null,
  );
});

test("OAuth callback uses verified claims and never auto-provisions a user", async () => {
  const [google, callback, identity, clientAuth] = await Promise.all([
    source("lib/google-auth.ts"),
    source("app/api/auth/callback/google/route.ts"),
    source("lib/identity.ts"),
    source("lib/client-auth.ts"),
  ]);
  assert.match(google, /normalizeVerifiedGoogleIdentity\(\{/);
  assert.match(callback, /verifyGoogleIdToken\(\s*tokens\.id_token/);
  assert.match(callback, /createSession\(identity\.email, identity\.subject\)/);
  assert.match(google, /findAdmittedAccount\(email, subject\)/);
  assert.match(identity, /lower\(trim\(\$\{users\.email\}\)\)/);
  assert.match(clientAuth, /findAdmittedAccount\(email, providerSubject\)/);
  assert.doesNotMatch(callback, /INSERT INTO users|insert\(users\)/);
  assert.doesNotMatch(clientAuth, /INSERT INTO users|insert\(users\)/);
});

test("normalized email indexes reject case and whitespace collisions atomically", async () => {
  const migration = await source(
    "migrations/0067_normalized_login_email_unique.sql",
  );

  for (const [table, emails] of [
    ["employees", ["User@Test.com", "user@test.com"]],
    ["users", [" user@test.com ", "user@test.com"]],
  ]) {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(
        "CREATE TABLE employees(email TEXT NOT NULL UNIQUE); CREATE TABLE users(email TEXT NOT NULL UNIQUE);",
      );
      const insert = db.prepare(`INSERT INTO ${table}(email) VALUES (?)`);
      for (const email of emails) insert.run(email);
      db.exec("BEGIN;");
      assert.throws(() => db.exec(migration), /UNIQUE constraint failed/);
      db.exec("ROLLBACK;");
      assert.equal(
        db
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type='index' AND name IN ('employees_normalized_email_uq','users_normalized_email_uq')",
          )
          .get().count,
        0,
      );
    } finally {
      db.close();
    }
  }
});

test("0067 is idempotent; NULL and blank semantics are explicit", async () => {
  const [migration, schema] = await Promise.all([
    source("migrations/0067_normalized_login_email_unique.sql"),
    source("db/schema.ts"),
  ]);
  assert.match(schema, /email: text\("email"\)\.notNull\(\)\.unique\(\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS/);

  const nullable = new DatabaseSync(":memory:");
  try {
    nullable.exec(
      "CREATE TABLE employees(email TEXT); CREATE TABLE users(email TEXT); INSERT INTO employees VALUES(NULL),(NULL); INSERT INTO users VALUES(NULL),(NULL);",
    );
    nullable.exec(migration);
    nullable.exec(migration);
    assert.equal(
      nullable
        .prepare("SELECT count(*) AS count FROM employees WHERE email IS NULL")
        .get().count,
      2,
    );
    assert.equal(
      nullable
        .prepare("SELECT count(*) AS count FROM users WHERE email IS NULL")
        .get().count,
      2,
    );
  } finally {
    nullable.close();
  }

  const blank = new DatabaseSync(":memory:");
  try {
    blank.exec(
      "CREATE TABLE employees(email TEXT NOT NULL UNIQUE); CREATE TABLE users(email TEXT NOT NULL UNIQUE); INSERT INTO employees VALUES(' '); INSERT INTO users VALUES('');",
    );
    blank.exec(migration);
    assert.throws(
      () => blank.prepare("INSERT INTO employees VALUES(?)").run(""),
      /UNIQUE constraint failed/,
    );
  } finally {
    blank.close();
  }
});

test("system-access administration is server-gated and cannot disable self", async () => {
  assert.equal(canManageSystemAccess("employee", true), false);
  assert.equal(canManageSystemAccess("hr_admin", true), false);
  assert.equal(canManageSystemAccess("super_admin", false), false);
  assert.equal(canManageSystemAccess("super_admin", true), true);
  assert.equal(isSelfAccount(12, 12), true);
  assert.equal(isSelfAccount(null, 12), false);
  assert.equal(isSelfAccount(11, 12), false);

  const [route, auth] = await Promise.all([
    source("app/api/employees/[id]/account-access/route.ts"),
    source("lib/auth.ts"),
  ]);
  assert.match(route, /canManageSystemAccess\(/);
  assert.match(route, /isSelfAccount\(actor\.userId, account\.id\)/);
  assert.match(route, /isProtectedSuperAdminUserId\(account\.id\)/);
  assert.match(auth, /where\(eq\(protectedAdminAccounts\.userId, userId\)\)/);
  assert.match(route, /\.where\(eq\(users\.employeeId, employeeId\)\)/);
  assert.match(route, /This employee does not have a system account/);
  assert.doesNotMatch(route, /INSERT INTO users|insert\(users\)/);
  assert.match(route, /employee\.status === "inactive"/);
});

test("account disable revokes actual web, extension, mobile and refresh stores", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE web_sessions(id TEXT PRIMARY KEY,user_id INTEGER,revoked_at TEXT);
      CREATE TABLE client_sessions(id TEXT PRIMARY KEY,user_id INTEGER,revoked_at TEXT);
      CREATE TABLE client_session_refresh_tokens(id TEXT PRIMARY KEY,session_id TEXT,revoked_at TEXT);
      CREATE TABLE oauth_authorization_codes(code_hash TEXT PRIMARY KEY,user_id INTEGER);
      CREATE TABLE mobile_push_tokens(id TEXT PRIMARY KEY,user_id INTEGER);
      INSERT INTO web_sessions VALUES ('web-target',1,NULL),('web-other',2,NULL);
      INSERT INTO client_sessions VALUES ('client-target',1,NULL),('client-other',2,NULL);
      INSERT INTO client_session_refresh_tokens VALUES ('refresh-target','client-target',NULL),('refresh-other','client-other',NULL);
      INSERT INTO oauth_authorization_codes VALUES ('code-target',1),('code-other',2);
      INSERT INTO mobile_push_tokens VALUES ('push-target',1),('push-other',2);
    `);

    for (const statement of accountAccessRevocationStatements(
      1,
      "2026-10-08T10:00:00.000Z",
    )) {
      db.prepare(statement.sql).run(...statement.values);
    }

    for (const [table, target, other] of [
      ["web_sessions", "web-target", "web-other"],
      ["client_sessions", "client-target", "client-other"],
      ["client_session_refresh_tokens", "refresh-target", "refresh-other"],
    ]) {
      assert.equal(
        db.prepare(`SELECT revoked_at FROM ${table} WHERE id=?`).get(target)
          .revoked_at,
        "2026-10-08T10:00:00.000Z",
      );
      assert.equal(
        db.prepare(`SELECT revoked_at FROM ${table} WHERE id=?`).get(other)
          .revoked_at,
        null,
      );
    }
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM oauth_authorization_codes WHERE user_id=1",
        )
        .get().count,
      0,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM mobile_push_tokens WHERE user_id=1",
        )
        .get().count,
      0,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM oauth_authorization_codes WHERE user_id=2",
        )
        .get().count,
      1,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM mobile_push_tokens WHERE user_id=2",
        )
        .get().count,
      1,
    );
  } finally {
    db.close();
  }
});

test("DateField calendar dates stay ISO and reject impossible dates", async () => {
  assert.equal(parseManualDate("29.02.2024"), "2024-02-29");
  assert.equal(parseManualDate("29.02.2023"), null);
  assert.equal(parseManualDate("31.02.2024"), null);
  assert.equal(parseManualDate("31.04.2024"), null);
  assert.equal(parseManualDate("01.01.2000"), "2000-01-01");
  assert.equal(parseManualDate("31.12.2099"), "2099-12-31");
  assert.equal(parseManualDate(""), null);

  const [
    field,
    dates,
    employeeForms,
    profileRecords,
    leave,
    termination,
    expenses,
    holidays,
    oneOnOne,
    tasks,
    time,
    compensation,
    contracts,
    updateRoute,
  ] = await Promise.all([
    source("components/ui/DateField.tsx"),
    source("modules/people/dates.ts"),
    source("components/EmployeeDirectory.tsx"),
    source("components/EmployeeProfileRecords.tsx"),
    source("components/LeaveWorkspace.tsx"),
    source("components/EmployeeProfileActions.tsx"),
    source("components/ExpenseWorkspace.tsx"),
    source("components/admin/HolidaySettings.tsx"),
    source("components/one-on-one/OneOnOneWorkspace.tsx"),
    source("components/tasks/TaskWorkspace.tsx"),
    source("components/time/TimeEntryDialogs.tsx"),
    source("components/EmployeeCompensation.tsx"),
    source("modules/people/contracts.ts"),
    source("app/api/employees/[id]/route.ts"),
  ]);
  assert.match(field, /type="hidden" name=\{name\} value=\{iso\}/);
  assert.match(field, /required=\{required\}/);
  assert.match(
    field,
    /validate\(event\.target\.value, event\.currentTarget, false\)/,
  );
  assert.match(field, /notifyValueChange\(parsed\)/);
  assert.match(field, /previousValuePropRef\.current === value/);
  assert.match(field, /emittedValueRef\.current === value/);
  assert.match(
    field,
    /function notifyValueChange\(nextValue: string\) \{[\s\S]*?emittedValueRef\.current = nextValue;/,
  );
  assert.match(
    field,
    /const complete = \/\^\\d\{2\}\\\.\\d\{2\}\\\.\\d\{4\}\$\//,
  );
  assert.match(field, /setError\(nextError\)/);
  assert.match(field, /if \(event\.key === "Enter"\)[\s\S]*?validate\(/);
  assert.match(field, /nextError === "range"/);
  assert.match(dates, /Date\.UTC\(/);
  assert.match(field, /timeZone: "UTC"/);
  assert.doesNotMatch(field, /\.toISOString\(\)/);
  assert.match(employeeForms, /DateField\s+name="startDate"/);
  assert.match(employeeForms, /DateField\s+name="probationEnd"/);
  assert.match(profileRecords, /DateField\s+name="startedOn"/);
  assert.match(termination, /DateField\s+name="lastWorkingDay"/);
  assert.match(leave, /DateField[\s\S]*name="startDate"/);
  assert.match(expenses, /DateField\s+name="expenseDate"/);
  assert.match(holidays, /DateField\s+name="date"/);
  assert.match(oneOnOne, /DateField/);
  assert.match(tasks, /DateField\s+name="dueDate"/);
  assert.match(time, /DateField\s+name="date"/);
  assert.match(compensation, /DateField[\s\S]*name="effectiveFrom"/);
  assert.match(
    contracts,
    /const optionalDate = z\.union\(\[z\.iso\.date\(\), z\.literal\(""\)\]\)/,
  );
  assert.match(updateRoute, /probationEnd \|\| null/);
});

test("one employment save creates a single history event only for state changes", async () => {
  const base = {
    jobTitle: "Specialist",
    level: "Middle",
    managerId: 8,
    location: "Lviv",
    division: "Ukraine",
    department: "People",
    team: "People Team",
    employmentType: "Full-time",
    status: "active",
  };
  assert.equal(hasEmploymentStateChanged(base, { ...base }), false);
  assert.equal(
    hasEmploymentStateChanged(base, {
      ...base,
    }),
    false,
    "a personal-field-only edit must not create employment history",
  );
  assert.equal(
    hasEmploymentStateChanged(base, {
      ...base,
      jobTitle: "Lead",
      level: "Senior",
      managerId: 9,
    }),
    true,
  );

  const route = await source("app/api/employees/[id]/route.ts");
  assert.match(route, /if \(employmentStateChanged\)\s*\{\s*statements\.push/);
  assert.match(route, /INSERT INTO employment_history/);
  assert.match(route, /await d1\.batch\(statements\)/);
  assert.doesNotMatch(
    route,
    /INSERT INTO employment_history[\s\S]{0,500}INSERT INTO employment_history/,
  );
});

test("generic profile startDate is optional, read-only and server-enforced", async () => {
  assert.equal(genericProfileStartDateChanged("2025-03-04", undefined), false);
  assert.equal(
    genericProfileStartDateChanged("2025-03-04", "2025-03-04"),
    false,
  );
  assert.equal(
    genericProfileStartDateChanged("2025-03-04", "2025-03-05"),
    true,
  );

  const [route, contracts, editor] = await Promise.all([
    source("app/api/employees/[id]/route.ts"),
    source("modules/people/contracts.ts"),
    source("components/EmployeeProfileActions.tsx"),
  ]);
  assert.match(contracts, /startDate: z\.iso\.date\(\)\.optional\(\)/);
  assert.match(
    route,
    /genericProfileStartDateChanged\(current\.startDate, startDate\)/,
  );
  assert.match(
    route,
    /Start date cannot be changed in the generic profile editor/,
  );
  assert.match(route, /\.bind\([\s\S]*?current\.startDate,/);
  assert.match(editor, /name="startDate"[\s\S]{0,180}readOnly/);
});

test("local date-only defaults do not use UTC serialization", async () => {
  const [profile, oneOnOne, oneOnOneRoute] = await Promise.all([
    source("components/EmployeeProfileActions.tsx"),
    source("components/one-on-one/OneOnOneWorkspace.tsx"),
    source("app/api/one-on-one/route.ts"),
  ]);
  assert.doesNotMatch(
    `${profile}\n${oneOnOne}\n${oneOnOneRoute}`,
    /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/,
  );
  assert.match(profile, /localDateKey\(\)/);
  assert.match(oneOnOne, /localDateKey\(\)/);
  assert.match(oneOnOneRoute, /getDateContext\(\)/);
});

test("history reasons remain stable values and are localized only for display", async () => {
  const [route, page, i18n] = await Promise.all([
    source("app/api/employees/[id]/route.ts"),
    source("app/employees/[id]/page.tsx"),
    source("lib/i18n.ts"),
  ]);
  assert.match(route, /changeReason \|\| "Employment details changed"/);
  assert.match(route, /changeReason\s*,/);
  assert.match(page, /formatEmploymentReason\(/);
  assert.match(page, /reason === "Employment details changed"/);
  assert.match(page, /reason === "Employment details changed"/);
  assert.match(
    i18n,
    /"Employment details changed": "Змінено дані працевлаштування"/,
  );
  assert.match(page, /return reason;/);
});

test("invitation action is role-gated and disabled with an explanation until delivery is configured", async () => {
  const actions = await source("components/EmployeeProfileActions.tsx");
  const i18n = await source("lib/i18n.ts");
  assert.match(actions, /Send system invitation/);
  assert.match(actions, /canManageInvitations && invitationSummaryState/);
  assert.match(actions, /!invitationSummaryState\.deliveryConfigured/);
  assert.match(actions, /t\("No invitation delivery is configured\."\)/);
  assert.match(actions, /POST/);
  assert.match(i18n, /"No invitation delivery is configured\."/);
  assert.doesNotMatch(actions, /Impersonate|Reset password/);
  assert.match(actions, /canDeleteEmployee = false/);
  assert.match(actions, /t\("Delete employee"\)/);
});

test("inventory history is server-scoped and read DTOs omit account email addresses", async () => {
  const [route, queries] = await Promise.all([
    source("app/api/inventory/route.ts"),
    source("modules/inventory/queries.ts"),
  ]);
  assert.match(
    route,
    /getOfficeInventory\(true, historyScope, includeAssetDetails\)/,
  );
  // Serial numbers, prices and holders only reach inventory managers.
  assert.match(
    route,
    /const includeAssetDetails =\s*canManageInventory\(user\.role, access\.manageInventory\) && !user\.isPreview;/,
  );
  assert.match(
    route,
    /if \(!canManageInventory\(user\.role, access\.manageInventory\)\)/,
  );
  assert.match(
    route,
    /command\.action === "history\.correct" && user\.role !== "super_admin"/,
  );
  assert.doesNotMatch(
    queries,
    /AS (?:actorEmail|createdByEmail|finalizedByEmail)/,
  );
  assert.match(queries, /createdByName/);
  assert.match(queries, /includeHistory && historyScope\s*\n\s*\?/);
});
