import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createEmployeeSchema } from "../modules/people/contracts.ts";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("employee hero exposes the accessible actions menu and existing flows", async () => {
  const [actions, page, css] = await Promise.all([
    source("components/EmployeeProfileActions.tsx"),
    source("app/employees/[id]/page.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(actions, /aria-haspopup="menu"/);
  assert.match(actions, /role="menu"/);
  assert.match(actions, /document\.addEventListener\("keydown"/);
  assert.match(actions, /document\.addEventListener\("pointerdown"/);
  assert.match(actions, /setEditingProfile\(true\)/);
  assert.match(actions, /setTerminating\(true\)/);
  assert.match(actions, /Send system invitation/);
  assert.match(
    actions,
    /disabled=\{[\s\S]*?!invitationSummaryState\.deliveryConfigured[\s\S]*?\}\s+title=\{/,
  );
  assert.match(actions, /canManageInvitations/);
  assert.match(actions, /method: "POST"/);
  assert.match(actions, /\/api\/employees\/\$\{employee\.id\}\/invitation/);
  assert.match(actions, /canExportCsv = false/);
  assert.match(actions, /t\("Export CSV"\)/);
  assert.match(
    actions,
    /\/api\/employees\/export\?employeeId=\$\{employee\.id\}/,
  );
  assert.doesNotMatch(page, /profile-hero-secondary-actions/);
  assert.doesNotMatch(actions, /Reset password|Impersonate/);
  assert.match(actions, /canDeleteEmployee = false/);
  assert.match(actions, /t\("Delete employee"\)/);
  assert.match(actions, /method: "DELETE"/);
  assert.match(css, /\.profile-actions-menu-panel\s*\{[^}]*right:\s*0;/);
  assert.doesNotMatch(css, /\.profile-actions-menu-panel\s*\{[^}]*left:\s*0;/);
});

test("Actions menu keeps the canonical profile editor mounted after closing", async () => {
  const actions = await source("components/EmployeeProfileActions.tsx");
  const menuStart = actions.indexOf("{menuOpen && (");
  const editorStart = actions.indexOf(
    "{editingProfile && editableEmployee && (",
  );
  const terminationStart = actions.indexOf(
    "{terminating && editableEmployee && (",
  );
  assert.ok(menuStart >= 0 && editorStart > menuStart);
  assert.ok(terminationStart > editorStart);
  assert.match(
    actions,
    /const \[editingProfile, setEditingProfile\] = useState\(false\)/,
  );
  assert.match(actions, /setMenuOpen\(false\);\s*setEditingProfile\(true\);/);
  assert.doesNotMatch(
    actions.slice(menuStart, editorStart),
    /<EditEmployeeDialog/,
  );
  assert.match(
    actions.slice(editorStart, terminationStart),
    /<EditEmployeeDialog[\s\S]*?mode="profile"/,
  );
});

test("HR date controls use one formatted field with a keyboard-accessible calendar", async () => {
  const [dateField, css, employeeRecords, leave, termination, directory] =
    await Promise.all([
      source("components/ui/DateField.tsx"),
      source("app/globals.css"),
      source("components/EmployeeProfileRecords.tsx"),
      source("components/LeaveWorkspace.tsx"),
      source("components/EmployeeProfileActions.tsx"),
      source("components/EmployeeDirectory.tsx"),
    ]);
  assert.match(dateField, /type="hidden" name=\{name\} value=\{iso\}/);
  assert.match(dateField, /type="text"/);
  assert.doesNotMatch(dateField, /type="date"/);
  assert.match(dateField, /onFocus=\{\(\) => \{/);
  assert.match(dateField, /onClick=\{openCalendar\}/);
  assert.match(dateField, /role="grid"/);
  assert.match(dateField, /event\.key === "Escape"/);
  assert.match(css, /\.date-field-calendar\s*\{/);
  assert.match(css, /\.date-field-calendar-day:focus-visible/);
  assert.match(employeeRecords, /DateField\s+name="startedOn"/);
  assert.match(employeeRecords, /DateField\s+name="endedOn"/);
  assert.match(leave, /DateField\s+name="startDate"/);
  assert.match(leave, /DateField[\s\S]{0,120}name="endDate"/);
  assert.match(termination, /DateField\s+name="lastWorkingDay"/);
  assert.match(directory, /DateField\s+name="probationEnd"/);
});

test("employee creation validates date-only input before its atomic write batch", async () => {
  const [contracts, route, command] = await Promise.all([
    source("modules/people/contracts.ts"),
    source("app/api/employees/route.ts"),
    source("modules/people/commands.ts"),
  ]);
  assert.match(contracts, /startDate: z\.iso\.date\(\)/);
  assert.match(route, /parseJsonRequest\(request, createEmployeeSchema\)/);
  assert.match(command, /await d1\.batch\(\[/);
  assert.match(command, /INSERT INTO users/);
  assert.match(command, /INSERT INTO employment_history/);
  assert.match(command, /employee_email_exists/);
  assert.match(command, /lower\(trim\(\$\{users\.email\}\)\)/);

  const validEmployee = {
    firstName: "Synthetic",
    lastName: "Example",
    email: "synthetic@example.test",
    jobTitle: "Analyst",
    department: "People",
    startDate: "2026-07-15",
    probationEnd: "",
  };
  assert.equal(createEmployeeSchema.safeParse(validEmployee).success, true);
  assert.equal(
    createEmployeeSchema.safeParse({
      ...validEmployee,
      startDate: "2020-09-31",
    }).success,
    false,
  );
  assert.equal(
    createEmployeeSchema.safeParse({
      ...validEmployee,
      startDate: undefined,
    }).success,
    false,
  );
});

test("general profile edits create history only for employment-state changes", async () => {
  const [route, profile, translations] = await Promise.all([
    source("app/api/employees/[id]/route.ts"),
    source("app/employees/[id]/page.tsx"),
    source("lib/i18n.ts"),
  ]);
  assert.match(route, /const employmentStateChanged =/);
  assert.match(
    route,
    /if \(employmentStateChanged\)\s*\{[\s\S]*?INSERT INTO employment_history/,
  );
  assert.match(route, /changeReason \|\| "Employment details changed"/);
  assert.match(
    profile,
    /formatEmploymentReason\(\s*item\.state\.changeReason,\s*t\s*,\s*\)/,
  );
  assert.match(
    translations,
    /"Employment details changed": "Змінено дані працевлаштування"/,
  );
});
