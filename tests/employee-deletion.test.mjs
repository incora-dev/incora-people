import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classifyEmployeeDeletionReference,
  employeeDeletionBlocker,
  employeeDeletionReferenceCategory,
  isEmployeeDeletionConfirmed,
} from "../modules/people/deletion-policy.ts";
import { translate } from "../lib/i18n.ts";
import { DatabaseSync } from "node:sqlite";

function eligibleCandidate(overrides = {}) {
  return {
    actorUserId: 1,
    targetUserId: 2,
    targetRole: "employee",
    employeeEmail: "accidental.person@incora.com",
    employeeCode: "INC-104",
    targetStatus: "active",
    accountMatchesEmployee: true,
    protectedIdentity: false,
    pristineInitialHistory: true,
    onlyUnusedGeneratedLeaveBalances: true,
    blockedReferenceCount: 0,
    confirmationName: "Фіктивний Працівник",
    employeeName: "Фіктивний Працівник",
    confirmsErroneousTestRecord: true,
    ...overrides,
  };
}

test("name and attestation govern both client submission and backend confirmation", () => {
  const name = "Ірина Коваль";
  for (const [input, attested, expected] of [
    ["", true, false],
    ["Ірина", true, false],
    ["Коваль Ірина", true, false],
    ["Ірина Коваль", false, false],
    ["  ірина   КОВАЛЬ  ", true, true],
  ]) {
    assert.equal(isEmployeeDeletionConfirmed(input, name, attested), expected);
    assert.equal(
      employeeDeletionBlocker(
        eligibleCandidate({
          employeeName: name,
          confirmationName: input,
          confirmsErroneousTestRecord: attested,
        }),
      ),
      expected ? null : "confirmation",
    );
  }
});

test("deletion form uses shared visible controls and localized, guarded feedback", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const [actions, directory, css] = await Promise.all([
    read("../components/EmployeeProfileActions.tsx"),
    read("../app/employees/page.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(
    actions,
    /className="form-grid">\s*<label className="employee-delete-confirmation span-two">[\s\S]*?<input\s+type="text"/,
  );
  assert.match(
    css,
    /\.form-grid input,[\s\S]*?border: 1px solid var\(--line\)/,
  );
  assert.match(actions, /disabled=\{deleteBusy \|\| !deleteConfirmed\}/);
  assert.match(
    actions,
    /if \(!canDeleteEmployee \|\| deleteBusy \|\| !deleteConfirmed\) return/,
  );
  assert.match(
    actions,
    /if \(!response.ok \|\| result.ok !== true\)[\s\S]*?setDeleteError[\s\S]*?return;[\s\S]*?setDeletingEmployee\(false\);\s*window.location.replace\("\/employees\?notice=employee-deleted"\)/,
  );
  assert.match(directory, /notice === "employee-deleted"[\s\S]*?role="status"/);
  assert.equal(translate("uk", "Delete permanently"), "Видалити назавжди");
  assert.equal(translate("uk", "Removing…"), "Видаляємо…");
});

test("an accidental ordinary-email profile is eligible when dependency checks are clean", () => {
  assert.equal(employeeDeletionBlocker(eligibleCandidate()), null);
});

test("a synthetic TEST-code profile is also eligible without a marker requirement", () => {
  assert.equal(
    employeeDeletionBlocker(
      eligibleCandidate({
        employeeEmail: "temporary@incora.com",
        employeeCode: "TEST-104",
      }),
    ),
    null,
  );
});

test("ordinary email does not bypass protected employment history", () => {
  assert.equal(
    employeeDeletionBlocker(
      eligibleCandidate({
        employeeEmail: "person@incora.com",
        pristineInitialHistory: false,
      }),
    ),
    "employment_history",
  );
});

test("employee deletion rejects self, protected, linked and changed HR records", () => {
  assert.equal(
    employeeDeletionBlocker(eligibleCandidate({ targetUserId: 1 })),
    "self",
  );
  assert.equal(
    employeeDeletionBlocker(eligibleCandidate({ protectedIdentity: true })),
    "protected",
  );
  assert.equal(
    employeeDeletionBlocker(eligibleCandidate({ targetRole: "hr_admin" })),
    "employee_only",
  );
  assert.equal(
    employeeDeletionBlocker(eligibleCandidate({ blockedReferenceCount: 1 })),
    "linked_records",
  );
  assert.equal(
    employeeDeletionBlocker(
      eligibleCandidate({ pristineInitialHistory: false }),
    ),
    "employment_history",
  );
  assert.equal(
    employeeDeletionBlocker(
      eligibleCandidate({ onlyUnusedGeneratedLeaveBalances: false }),
    ),
    "leave_history",
  );
});

test("employee deletion fails closed for unrecognized foreign-key references", () => {
  assert.equal(
    classifyEmployeeDeletionReference({
      parent: "employees",
      table: "employee_compensations",
      column: "employee_id",
    }),
    "blocked",
  );
  assert.equal(
    classifyEmployeeDeletionReference({
      parent: "employees",
      table: "employee_private_details",
      column: "employee_id",
    }),
    "blocked",
  );
  assert.equal(
    classifyEmployeeDeletionReference({
      parent: "employees",
      table: "employee_profile_records",
      column: "employee_id",
    }),
    "routine-profile-metadata-cleanup",
  );
  assert.equal(
    classifyEmployeeDeletionReference({
      parent: "users",
      table: "web_sessions",
      column: "user_id",
    }),
    "account-session-cleanup",
  );
  assert.equal(
    classifyEmployeeDeletionReference({
      parent: "users",
      table: "employee_view_previews",
      column: "target_user_id",
    }),
    "preview-session-cleanup",
  );
  assert.equal(
    employeeDeletionReferenceCategory({
      parent: "employees",
      table: "employee_compensations",
      column: "employee_id",
    }),
    "Compensation or payroll history",
  );
});

test("employee deletion route rechecks Super Admin, fresh auth and atomic blockers", async () => {
  const route = await readFile(
    new URL("../app/api/employees/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /export async function DELETE/);
  assert.match(route, /actor\.role !== "super_admin"/);
  assert.match(route, /hasRecentAuthentication\(actor\)/);
  assert.match(route, /employeeDeletionReferences\(/);
  assert.match(route, /lower\(substr\(name,1,4\)\)<>'_cf_'/);
  assert.match(route, /AND \$\{balancedDeletionChecks\(referenceChecks\)\}/);
  assert.match(
    route,
    /values: \[\s*employeeId,\s*userId,\s*actorUserId,\s*employee\.email,\s*employee\.employeeCode,\s*employee\.firstName,\s*employee\.lastName,\s*actorUserId,\s*\.\.\.referenceValues/,
  );
  assert.match(
    route,
    /Could not verify employee dependencies\. No data was changed\./,
  );
  assert.match(route, /await d1\.batch\(\[/);
  assert.match(
    route,
    /employee_profile_records WHERE employee_id=\? AND kind='skill'/,
  );
  assert.match(route, /AND kind<>'skill'/);
  assert.match(route, /DELETE FROM employee_view_previews/);
  assert.match(route, /blockerCategories: references\.blockerCategories/);
  assert.match(route, /employee\.employeeCode/);
  assert.match(route, /employee\.email/);
  assert.match(route, /employee\.status/);
  assert.match(route, /employee\.permanently_deleted/);
  assert.match(route, /DELETE FROM web_sessions WHERE user_id=\?/);
  assert.match(route, /DELETE FROM client_sessions WHERE \(user_id=\?/);
  assert.doesNotMatch(route, /DELETE FROM employee_compensations/);
  assert.doesNotMatch(route, /example\.test/);
});

test("safe employee, account, onboarding skill and session cleanup preserves foreign keys", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE employees(id INTEGER PRIMARY KEY);
      CREATE TABLE users(id INTEGER PRIMARY KEY, employee_id INTEGER UNIQUE REFERENCES employees(id));
      CREATE TABLE web_sessions(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id));
      CREATE TABLE employee_view_previews(id INTEGER PRIMARY KEY, target_user_id INTEGER NOT NULL REFERENCES users(id), target_employee_id INTEGER NOT NULL REFERENCES employees(id));
      CREATE TABLE employee_profile_records(id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), kind TEXT NOT NULL);
      CREATE TABLE employment_history(id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id));
      CREATE TABLE leave_balances(id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), used INTEGER NOT NULL, adjustment INTEGER NOT NULL);
      INSERT INTO employees VALUES (2);
      INSERT INTO users VALUES (20,2);
      INSERT INTO web_sessions VALUES (200,20);
      INSERT INTO employee_view_previews VALUES (204,20,2);
      INSERT INTO employee_profile_records VALUES (201,2,'skill');
      INSERT INTO employment_history VALUES (202,2);
      INSERT INTO leave_balances VALUES (203,2,0,0);
    `);
    db.exec("BEGIN");
    db.exec(
      "DELETE FROM employee_view_previews WHERE target_user_id=20 OR target_employee_id=2",
    );
    db.exec("DELETE FROM web_sessions WHERE user_id=20");
    db.exec("DELETE FROM users WHERE id=20 AND employee_id=2");
    db.exec(
      "DELETE FROM employee_profile_records WHERE employee_id=2 AND kind='skill'",
    );
    db.exec("DELETE FROM employment_history WHERE employee_id=2");
    db.exec(
      "DELETE FROM leave_balances WHERE employee_id=2 AND used=0 AND adjustment=0",
    );
    db.exec("DELETE FROM employees WHERE id=2");
    db.exec("COMMIT");

    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM employees").get().count,
      0,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM users").get().count,
      0,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM web_sessions").get().count,
      0,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM employee_view_previews").get()
        .count,
      0,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("protected linked history prevents deletion without partial cleanup", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE employees(id INTEGER PRIMARY KEY);
      CREATE TABLE users(id INTEGER PRIMARY KEY, employee_id INTEGER UNIQUE REFERENCES employees(id));
      CREATE TABLE employee_compensations(id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id));
      INSERT INTO employees VALUES (2);
      INSERT INTO users VALUES (20,2);
      INSERT INTO employee_compensations VALUES (30,2);
    `);
    db.exec("BEGIN");
    try {
      db.exec("DELETE FROM users WHERE id=20");
      db.exec("DELETE FROM employees WHERE id=2");
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
    }
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM employees WHERE id=2").get()
        .count,
      1,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM users WHERE id=20").get().count,
      1,
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM employee_compensations WHERE employee_id=2",
        )
        .get().count,
      1,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});
