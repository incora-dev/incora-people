import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const root = new URL("../", import.meta.url);
const YEAR = 2026;
const ADMIN_EMAIL = "qa01@synthetic.incora.test";
const HR_EMAIL = "qa02@synthetic.incora.test";
const MANAGER_EMAIL = "qa03@synthetic.incora.test";

/**
 * A deterministic, database-level production simulation. It deliberately uses
 * only synthetic accounts and an in-memory SQLite D1-compatible schema.
 * No Cloudflare binding, R2 object, network, or production data is touched.
 */
test("runs a ten-employee real-data lifecycle with healthy dependencies", async () => {
  const db = await databaseFromHistory("migrations");
  const startedAt = Date.now();
  try {
    db.exec("PRAGMA foreign_keys = ON");
    const catalog = seedReferenceCatalog(db);
    const syntheticEmployees = seedEmployees(db, catalog);
    const syntheticUsers = seedUsers(db, syntheticEmployees);
    seedAccessPolicies(db);
    assert.equal(syntheticEmployees.length, 10);
    assert.equal(syntheticUsers.length, 10);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM employees WHERE email LIKE '%@synthetic.incora.test'",
        )
        .get().count,
      10,
    );

    const leave = simulateLeave(db, syntheticEmployees, syntheticUsers);
    const time = simulateTime(db, syntheticEmployees);
    const reimbursements = simulateReimbursements(
      db,
      syntheticEmployees,
      syntheticUsers,
    );
    const tasks = simulateTasks(db, syntheticEmployees);
    const communications = simulateAnnouncements(db, syntheticUsers);
    const oneOnOnes = simulateOneOnOnes(db, syntheticEmployees, syntheticUsers);
    const assets = simulateAssets(db, syntheticEmployees);
    const documents = simulateDocuments(db, syntheticEmployees);
    const inventory = simulateInventory(db);
    const profile = simulateProfileRecords(db, syntheticEmployees, catalog);
    const bugReports = simulateBugReport(
      db,
      syntheticEmployees,
      syntheticUsers,
    );

    const integrity = runIntegrityChecks(db);
    assert.deepEqual(integrity, {
      foreignKeys: 0,
      missingEmployeeAccounts: 0,
      missingAccessPolicies: 0,
      incompleteOrganizationReferences: 0,
      staleManagerNames: 0,
      managerCycles: 0,
      leaveLedgerMismatches: 0,
      missingCurrentYearBalances: 0,
      orphanFiles: 0,
      duplicateOpenTimeEmployees: 0,
      duplicateEmployeeUserLinks: 0,
      invalidTechnologyReferences: 0,
      legacyCompensationRecords: 0,
    });

    const summary = {
      syntheticEmployees: syntheticEmployees.length,
      linkedAccounts: syntheticUsers.length,
      leaveRequests: leave.requests,
      leaveLedgerEvents: leave.ledgerEvents,
      timeEntries: time.entries,
      breaks: time.breaks,
      reimbursements: reimbursements.requests,
      tasksCompleted: tasks.completed,
      announcementComments: communications.comments,
      announcementReactions: communications.reactions,
      pollResponses: communications.pollResponses,
      announcementDismissals: communications.dismissals,
      oneOnOnePlans: oneOnOnes.plans,
      oneOnOneMeetings: oneOnOnes.meetings,
      assets: assets.assets,
      assetEvents: assets.events,
      employeeDocuments: documents.documents,
      companyDocuments: documents.companyDocuments,
      inventoryMovements: inventory.movements,
      technologyRecords: profile.technologyRecords,
      bugReports: bugReports.reports,
      integrityChecks: Object.keys(integrity).length,
      elapsedMs: Date.now() - startedAt,
    };
    assert.equal(summary.syntheticEmployees, 10);
    assert.equal(summary.leaveRequests, 11);
    assert.equal(summary.timeEntries, 21);
    assert.equal(summary.reimbursements, 10);
    assert.equal(summary.tasksCompleted, 10);
    assert.equal(summary.announcementComments, 10);
    assert.equal(summary.announcementReactions, 10);
    assert.equal(summary.pollResponses, 10);
    assert.equal(summary.oneOnOneMeetings, 2);
    assert.equal(summary.employeeDocuments, 10);
    assert.equal(summary.technologyRecords, 15);
    console.log(`REAL_DATA_SIMULATION ${JSON.stringify(summary)}`);
  } finally {
    db.close();
  }
});

async function databaseFromHistory(directory) {
  const files = (await readdir(new URL(`${directory}/`, root)))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const db = new DatabaseSync(":memory:");
  for (const file of files) {
    const migration = await readFile(
      new URL(`${directory}/${file}`, root),
      "utf8",
    );
    if (file === "0065_employee_profile_compensation.sql") db.exec("BEGIN;");
    db.exec(migration);
    if (file === "0065_employee_profile_compensation.sql") db.exec("COMMIT;");
  }
  return db;
}

function insertReference(db, kind, value, label) {
  return Number(
    db
      .prepare(
        "INSERT INTO reference_values(kind,value,label,active,sort_order) VALUES(?,?,?,?,?) RETURNING id",
      )
      .get(kind, value, label, 1, 10).id,
  );
}

function seedReferenceCatalog(db) {
  const levels = {
    senior: insertReference(db, "level", "qa-senior", "QA Senior"),
    middle: insertReference(db, "level", "qa-middle", "QA Middle"),
    junior: insertReference(db, "level", "qa-junior", "QA Junior"),
  };
  const positions = {
    admin: insertReference(db, "position", "qa-admin", "QA People Admin"),
    hr: insertReference(db, "position", "qa-hr", "QA HR Partner"),
    manager: insertReference(db, "position", "qa-manager", "QA People Manager"),
    developer: insertReference(db, "position", "qa-developer", "QA Developer"),
    qa: insertReference(db, "position", "qa-engineer", "QA Engineer"),
    designer: insertReference(db, "position", "qa-designer", "QA Designer"),
    analyst: insertReference(db, "position", "qa-analyst", "QA Analyst"),
  };
  const technologies = [
    ["qa-typescript", "TypeScript"],
    ["qa-react", "React"],
    ["qa-sql", "SQL"],
  ].map(([value, label]) => ({
    id: insertReference(db, "technology", value, label),
    label,
  }));
  const productDepartment = Number(
    db
      .prepare(
        "INSERT INTO org_units(type,name,parent_id,active,sort_order) VALUES('department','QA Product',1,1,10) RETURNING id",
      )
      .get().id,
  );
  const productTeam = Number(
    db
      .prepare(
        "INSERT INTO org_units(type,name,parent_id,active,sort_order) VALUES('team', 'QA Product Team', ?, 1, 10) RETURNING id",
      )
      .get(productDepartment).id,
  );
  return {
    levels,
    positions,
    technologies,
    divisionId: 1,
    adminDepartmentId: 2,
    adminTeamId: 3,
    productDepartmentId: productDepartment,
    productTeamId: productTeam,
    employmentTypeId: 1,
  };
}

function seedEmployees(db, catalog) {
  const specs = [
    [
      "Admin",
      "One",
      "QA People Admin",
      "senior",
      "admin",
      "Administration",
      "Administration Team",
      null,
      null,
    ],
    [
      "HR",
      "Two",
      "QA HR Partner",
      "senior",
      "hr",
      "Administration",
      "Administration Team",
      null,
      "2026-12-31",
    ],
    [
      "Manager",
      "Three",
      "QA People Manager",
      "senior",
      "manager",
      "Administration",
      "Administration Team",
      null,
      null,
    ],
    [
      "Developer",
      "Four",
      "QA Developer",
      "middle",
      "developer",
      "QA Product",
      "QA Product Team",
      "manager",
      null,
    ],
    [
      "Developer",
      "Five",
      "QA Developer",
      "middle",
      "developer",
      "QA Product",
      "QA Product Team",
      "manager",
      "2026-12-31",
    ],
    [
      "Engineer",
      "Six",
      "QA Engineer",
      "middle",
      "qa",
      "QA Product",
      "QA Product Team",
      "manager",
      null,
    ],
    [
      "Designer",
      "Seven",
      "QA Designer",
      "junior",
      "designer",
      "QA Product",
      "QA Product Team",
      "manager",
      null,
    ],
    [
      "Analyst",
      "Eight",
      "QA Analyst",
      "junior",
      "analyst",
      "QA Product",
      "QA Product Team",
      "manager",
      null,
    ],
    [
      "Developer",
      "Nine",
      "QA Developer",
      "middle",
      "developer",
      "QA Product",
      "QA Product Team",
      "manager",
      null,
    ],
    [
      "Engineer",
      "Ten",
      "QA Engineer",
      "middle",
      "qa",
      "QA Product",
      "QA Product Team",
      "manager",
      null,
    ],
  ];
  const result = [];
  const insert = db.prepare(
    `INSERT INTO employees(
      employee_code,first_name,last_name,ukrainian_name,email,job_title,
      department,division,team,level,location,manager_name,manager_id,
      employment_type,status,start_date,probation_end,default_work_mode,
      division_unit_id,department_unit_id,team_unit_id,position_value_id,
      level_value_id,employment_type_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  );
  for (let index = 0; index < specs.length; index += 1) {
    const [
      firstName,
      lastName,
      jobTitle,
      level,
      position,
      department,
      team,
      managerKind,
      probationEnd,
    ] = specs[index];
    const manager = managerKind ? result[2] : null;
    const departmentId =
      department === "Administration"
        ? catalog.adminDepartmentId
        : catalog.productDepartmentId;
    const teamId =
      team === "Administration Team"
        ? catalog.adminTeamId
        : catalog.productTeamId;
    const employee = insert.get(
      `QA-${String(index + 1).padStart(2, "0")}`,
      firstName,
      lastName,
      `${firstName} ${lastName}`,
      `qa${String(index + 1).padStart(2, "0")}@synthetic.incora.test`,
      jobTitle,
      department,
      "Ukraine",
      team,
      `QA ${level[0].toUpperCase()}${level.slice(1)}`,
      "Office",
      manager ? `${manager.firstName} ${manager.lastName}` : null,
      manager?.id ?? null,
      "Full-time",
      "active",
      "2025-01-15",
      probationEnd,
      "office",
      catalog.divisionId,
      departmentId,
      teamId,
      catalog.positions[position],
      catalog.levels[level],
      catalog.employmentTypeId,
    );
    result.push({
      id: Number(employee.id),
      email: `qa${String(index + 1).padStart(2, "0")}@synthetic.incora.test`,
      firstName,
      lastName,
      jobTitle,
      level,
    });
  }
  assert.throws(
    () =>
      db
        .prepare("UPDATE employees SET manager_id=? WHERE id=?")
        .run(result[3].id, result[2].id),
    /manager hierarchy cycle/,
  );
  return result;
}

function seedUsers(db, employees) {
  const roles = [
    "super_admin",
    "hr_admin",
    "manager",
    ...Array(7).fill("employee"),
  ];
  const insert = db.prepare(
    "INSERT INTO users(email,role,employee_id,locale,manage_projects) VALUES(?,?,?,?,?) RETURNING id",
  );
  return employees.map((employee, index) => ({
    id: Number(
      insert.get(
        employee.email,
        roles[index],
        employee.id,
        "uk",
        index === 0 ? 1 : 0,
      ).id,
    ),
    email: employee.email,
    employeeId: employee.id,
    role: roles[index],
  }));
}

function seedAccessPolicies(db) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO access_policies(role,label,manage_people,view_sensitive_data,approve_leave,approve_time,approve_expenses,view_audit,manage_settings) VALUES(?,?,?,?,?,?,?,?,?)",
  );
  insert.run("super_admin", "QA super administrator", 1, 1, 1, 1, 1, 1, 1);
  insert.run("hr_admin", "QA HR administrator", 1, 1, 1, 0, 1, 0, 1);
  insert.run("manager", "QA manager", 0, 0, 1, 0, 0, 0, 0);
  insert.run("employee", "QA employee", 0, 0, 0, 0, 0, 0, 0);
}

function simulateLeave(db, employees, users) {
  const leaveTypes = {};
  for (const [code, name, allowance] of [
    ["vacation", "Vacation", 20],
    ["sick", "Sick leave", 10],
    ["unpaid", "Unpaid leave", 0],
  ]) {
    leaveTypes[code] = Number(
      db
        .prepare(
          "INSERT INTO leave_types(code,name,color,default_allowance,requires_approval) VALUES(?,?,?,?,?) RETURNING id",
        )
        .get(code, name, "#ffd400", allowance, code === "unpaid" ? 0 : 1).id,
    );
  }
  const balance = db.prepare(
    "INSERT INTO leave_balances(employee_id,leave_type_id,year,allowance,used,adjustment) VALUES(?,?,?,?,0,0)",
  );
  for (const employee of allEmployees(db, employees)) {
    balance.run(employee.id, leaveTypes.vacation, YEAR, 20);
    balance.run(employee.id, leaveTypes.sick, YEAR, 10);
    balance.run(employee.id, leaveTypes.unpaid, YEAR, 0);
  }

  const request = db.prepare(
    "INSERT INTO leave_requests(employee_id,leave_type_id,start_date,end_date,days,reason,status) VALUES(?,?,?,?,?,?,?) RETURNING id",
  );
  const requests = [];
  for (let index = 0; index < employees.length; index += 1) {
    const employee = employees[index];
    const date = `2026-09-${String(index + 1).padStart(2, "0")}`;
    const row = request.get(
      employee.id,
      leaveTypes.vacation,
      date,
      date,
      0.5,
      "Synthetic lifecycle",
      "pending",
    );
    requests.push(Number(row.id));
    db.prepare(
      "UPDATE leave_requests SET status='approved', reviewer_email=?, reviewed_at=? WHERE id=?",
    ).run(ADMIN_EMAIL, "2026-08-28T09:00:00.000Z", row.id);
    db.prepare(
      "INSERT INTO notifications(user_email,title,message,href) VALUES(?,?,?,?)",
    ).run(HR_EMAIL, "New leave request", employee.email, "/leave");
  }
  const sickRequest = request.get(
    employees[0].id,
    leaveTypes.sick,
    "2026-10-12",
    "2026-10-12",
    1,
    "Sick day",
    "pending",
  );
  requests.push(Number(sickRequest.id));
  db.prepare(
    "UPDATE leave_requests SET status='approved', reviewer_email=? WHERE id=?",
  ).run(ADMIN_EMAIL, sickRequest.id);
  db.prepare(
    "UPDATE leave_requests SET status='withdrawn', reviewer_email=? WHERE id=?",
  ).run(ADMIN_EMAIL, requests[0]);

  assert.throws(
    () =>
      request.get(
        employees[0].id,
        leaveTypes.vacation,
        "2026-09-01",
        "2026-09-01",
        0.25,
        "invalid",
        "pending",
      ),
    /half-day increments/,
  );
  assert.throws(
    () =>
      request.get(
        employees[1].id,
        leaveTypes.vacation,
        "2026-09-02",
        "2026-09-02",
        0.5,
        "overlap",
        "pending",
      ),
    /overlaps/,
  );
  assert.throws(
    () =>
      db
        .prepare("UPDATE leave_requests SET days=1 WHERE id=?")
        .run(requests[1]),
    /approved leave request is immutable/,
  );
  assert.equal(
    db
      .prepare(
        "SELECT used FROM leave_balances WHERE employee_id=? AND leave_type_id=? AND year=?",
      )
      .get(employees[0].id, leaveTypes.vacation, YEAR).used,
    0,
  );
  assert.equal(
    db
      .prepare(
        "SELECT used FROM leave_balances WHERE employee_id=? AND leave_type_id=? AND year=?",
      )
      .get(employees[0].id, leaveTypes.sick, YEAR).used,
    1,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM leave_ledger").get().count,
    12,
  );
  return { requests: requests.length, ledgerEvents: 12, users };
}

function simulateTime(db, employees) {
  const projectId = Number(
    db
      .prepare(
        "INSERT INTO time_projects(name,code,active) VALUES(?,?,1) RETURNING id",
      )
      .get("QA project", "QA-CORE").id,
  );
  const entry = db.prepare(
    "INSERT INTO time_entries(employee_id,clock_in,clock_out,source,note,project_id,time_code,work_mode) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
  );
  let entries = 0;
  let breaks = 0;
  for (let index = 0; index < employees.length; index += 1) {
    const employee = employees[index];
    const mode = index % 2 ? "remote" : "office";
    const first = entry.get(
      employee.id,
      "2026-08-20T09:00:00.000Z",
      "2026-08-20T17:00:00.000Z",
      "web",
      "Synthetic workday",
      projectId,
      "project",
      mode,
    );
    entries += 1;
    db.prepare(
      "INSERT INTO break_entries(time_entry_id,started_at,ended_at) VALUES(?,?,?)",
    ).run(first.id, "2026-08-20T12:00:00.000Z", "2026-08-20T12:30:00.000Z");
    breaks += 1;
    db.prepare(
      "INSERT INTO work_mode_entries(employee_id,work_date,mode) VALUES(?,?,?)",
    ).run(employee.id, "2026-08-20", mode);
    entry.get(
      employee.id,
      "2026-08-21T10:00:00.000Z",
      "2026-08-21T11:00:00.000Z",
      "manual",
      "Manual correction",
      projectId,
      "project",
      mode,
    );
    entries += 1;
  }
  const open = db
    .prepare(
      "INSERT INTO time_entries(employee_id,clock_in,source,work_mode) VALUES(?,?,?,?) RETURNING id",
    )
    .get(employees[0].id, "2026-08-26T09:00:00.000Z", "web", "office");
  entries += 1;
  db.prepare(
    "INSERT INTO work_mode_entries(employee_id,work_date,mode) VALUES(?,?,?)",
  ).run(employees[0].id, "2026-08-26", "office");
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO time_entries(employee_id,clock_in,source,work_mode) VALUES(?,?,?,?)",
        )
        .run(employees[0].id, "2026-08-26T10:00:00.000Z", "web", "office"),
    /UNIQUE constraint failed/,
  );
  db.prepare("UPDATE time_entries SET clock_out=? WHERE id=?").run(
    "2026-08-26T17:00:00.000Z",
    open.id,
  );
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO time_entries(employee_id,clock_in,clock_out,source,work_mode) VALUES(?,?,?,?,?)",
        )
        .run(
          employees[0].id,
          "2026-08-27T09:00:00.000Z",
          "2026-08-27T10:00:00.000Z",
          "web",
          "hybrid",
        ),
    /CHECK constraint failed/,
  );
  return { entries, breaks };
}

function simulateReimbursements(db, employees) {
  db.prepare(
    "INSERT INTO reimbursement_policies(name,currency,per_request_limit,annual_limit,max_requests_per_year,requires_receipt,requires_approval,enabled) VALUES(?,?,?,?,?,?,?,1)",
  ).run("QA policy", "UAH", 100000, 300000, 12, 1, 1);
  const categories = ["Sport", "Health", "Education", "Other"];
  const insert = db.prepare(
    "INSERT INTO reimbursement_requests(employee_id,category,amount_cents,currency,expense_date,description,receipt_url,status) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
  );
  const ids = employees.map((employee, index) =>
    Number(
      insert.get(
        employee.id,
        categories[index % categories.length],
        1000 + index * 100,
        "UAH",
        `2026-08-${String(index + 1).padStart(2, "0")}`,
        "Synthetic reimbursement",
        `/api/files/qa-receipt-${index + 1}`,
        "pending",
      ).id,
    ),
  );
  db.prepare(
    "UPDATE reimbursement_requests SET status='approved',reviewer_email=? WHERE id=?",
  ).run(ADMIN_EMAIL, ids[0]);
  db.prepare(
    "UPDATE reimbursement_requests SET status='rejected',reviewer_email=? WHERE id=?",
  ).run(ADMIN_EMAIL, ids[1]);
  db.prepare(
    "UPDATE reimbursement_requests SET status='withdrawn' WHERE id=?",
  ).run(ids[2]);
  const usage = db
    .prepare(
      "SELECT employee_id,COUNT(*) AS count,SUM(amount_cents) AS total FROM reimbursement_requests WHERE status NOT IN ('rejected','withdrawn') GROUP BY employee_id",
    )
    .all();
  assert.equal(usage.length, 8);
  assert.ok(usage.every((row) => row.count <= 12 && row.total <= 300000));
  return { requests: ids.length };
}

function simulateTasks(db, employees) {
  const insert = db.prepare(
    "INSERT INTO people_tasks(title,description,category,assignee_employee_id,due_date,status,created_by_email) VALUES(?,?,?,?,?,?,?) RETURNING id",
  );
  const ids = employees.map((employee, index) =>
    Number(
      insert.get(
        `Onboarding QA ${index + 1}`,
        "Synthetic lifecycle task",
        "onboarding",
        employee.id,
        "2026-09-30",
        "todo",
        ADMIN_EMAIL,
      ).id,
    ),
  );
  for (const id of ids)
    db.prepare(
      "UPDATE people_tasks SET status='done',completed_at=? WHERE id=?",
    ).run("2026-08-28T10:00:00.000Z", id);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS count FROM people_tasks WHERE status='todo'")
      .get().count,
    0,
  );
  return { completed: ids.length };
}

function simulateAnnouncements(db, users) {
  const announcementId = Number(
    db
      .prepare(
        "INSERT INTO announcements(title,body,published_at,pinned,active,created_by_email) VALUES(?,?,?,?,?,?) RETURNING id",
      )
      .get(
        "Synthetic product update",
        "<p>QA announcement</p>",
        "2026-08-28T08:00:00.000Z",
        1,
        1,
        ADMIN_EMAIL,
      ).id,
  );
  const pollId = Number(
    db
      .prepare(
        "INSERT INTO announcement_polls(announcement_id,question,options_json,active,description,questions_json) VALUES(?,?,?,?,?,?) RETURNING id",
      )
      .get(
        announcementId,
        "Which update helps most?",
        "[]",
        1,
        "Synthetic poll",
        JSON.stringify([
          {
            id: "q1",
            title: "Which update helps most?",
            type: "single",
            required: true,
            options: [
              { id: "a", title: "Time" },
              { id: "b", title: "Leave" },
            ],
          },
        ]),
      ).id,
  );
  db.prepare(
    "INSERT INTO announcement_deliveries(announcement_id,channel,scheduled_for,status) VALUES(?,?,?,?)",
  ).run(announcementId, "google_chat", "2026-08-28T08:00:00.000Z", "pending");
  db.prepare(
    "INSERT INTO announcement_deliveries(announcement_id,channel,scheduled_for,status) VALUES(?,?,?,?)",
  ).run(announcementId, "email", "2026-08-28T08:00:00.000Z", "pending");
  for (let index = 0; index < users.length; index += 1) {
    const user = users[index];
    db.prepare(
      "INSERT INTO announcement_comments(announcement_id,user_email,body) VALUES(?,?,?)",
    ).run(announcementId, user.email, `Synthetic comment ${index + 1}`);
    db.prepare(
      "INSERT INTO announcement_reactions(announcement_id,user_email,emoji) VALUES(?,?,?)",
    ).run(
      announcementId,
      user.email,
      ["👍", "❤️", "🎉", "👏", "😄", "🤔"][index % 6],
    );
    db.prepare(
      "INSERT INTO announcement_poll_responses(poll_id,user_email,option_index,answers_json) VALUES(?,?,?,?)",
    ).run(
      pollId,
      user.email,
      index % 2,
      JSON.stringify({ q1: index % 2 ? "b" : "a" }),
    );
    db.prepare(
      "INSERT INTO announcement_dismissals(announcement_id,user_email) VALUES(?,?)",
    ).run(announcementId, user.email);
  }
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO announcement_poll_responses(poll_id,user_email,option_index) VALUES(?,?,?)",
        )
        .run(pollId, users[0].email, 0),
    /UNIQUE constraint failed/,
  );
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO announcement_dismissals(announcement_id,user_email) VALUES(?,?)",
        )
        .run(announcementId, users[0].email),
    /UNIQUE constraint failed/,
  );
  db.prepare(
    "UPDATE announcement_deliveries SET status='sent',sent_at=? WHERE announcement_id=?",
  ).run("2026-08-28T08:01:00.000Z", announcementId);
  return { comments: 10, reactions: 10, pollResponses: 10, dismissals: 10 };
}

function simulateOneOnOnes(db, employees) {
  for (const [audience, cadence] of [
    ["developers", 30],
    ["managers", 30],
    ["probation", 14],
  ]) {
    db.prepare(
      "INSERT INTO one_on_one_rules(audience,cadence_days,active,updated_by_email) VALUES(?,?,1,?) ON CONFLICT(audience) DO UPDATE SET cadence_days=excluded.cadence_days,active=excluded.active,updated_by_email=excluded.updated_by_email",
    ).run(audience, cadence, HR_EMAIL);
  }
  const planInsert = db.prepare(
    "INSERT INTO one_on_one_plans(employee_id,facilitator_email,facilitator_kind,cadence_days,active) VALUES(?,?,?,?,1) RETURNING id",
  );
  const taskInsert = db.prepare(
    "INSERT INTO people_tasks(title,description,category,assignee_employee_id,due_date,status,created_by_email) VALUES(?,?,?,?,?,?,?) RETURNING id",
  );
  // These are the same cohorts selected by the HR sync rules: probation,
  // managers, and developers (with a shorter cadence for probation).
  const hrTargets = [
    employees[1],
    employees[2],
    employees[3],
    employees[4],
    employees[8],
  ];
  const hrPlans = hrTargets.map((target) => {
    const cadence =
      target === employees[1] || target === employees[4] ? 14 : 30;
    const planId = Number(
      planInsert.get(target.id, HR_EMAIL, "hr", cadence).id,
    );
    const taskId = Number(
      taskInsert.get(
        `Провести one-on-one: ${target.firstName} ${target.lastName}`,
        `Автоматично створено з плану one-on-one #${planId}.`,
        "general",
        employees[1].id,
        "2026-09-27",
        "todo",
        HR_EMAIL,
      ).id,
    );
    return { planId, taskId, target };
  });
  const firstHrPlan = hrPlans[2];
  const managerPlanId = Number(
    db
      .prepare(
        "INSERT INTO one_on_one_plans(employee_id,facilitator_email,facilitator_kind,cadence_days,active) VALUES(?,?,?,?,1) RETURNING id",
      )
      .get(employees[3].id, MANAGER_EMAIL, "manager", 30).id,
  );
  db.prepare(
    "INSERT INTO one_on_one_meetings(plan_id,employee_id,facilitator_email,held_at,notes,shared_with_employee,shared_with_manager) VALUES(?,?,?,?,?,?,?)",
  ).run(
    firstHrPlan.planId,
    firstHrPlan.target.id,
    HR_EMAIL,
    "2026-08-28T11:00:00.000Z",
    "Synthetic check-in",
    1,
    0,
  );
  db.prepare(
    "UPDATE people_tasks SET status='done',completed_at=? WHERE id=?",
  ).run("2026-08-28T11:30:00.000Z", firstHrPlan.taskId);
  db.prepare(
    "INSERT INTO people_tasks(title,description,category,assignee_employee_id,due_date,status,created_by_email) VALUES(?,?,?,?,?,?,?)",
  ).run(
    `Провести one-on-one: ${firstHrPlan.target.firstName} ${firstHrPlan.target.lastName}`,
    `Автоматично створено з плану one-on-one #${firstHrPlan.planId}.`,
    "general",
    employees[1].id,
    "2026-09-27",
    "todo",
    HR_EMAIL,
  );
  db.prepare(
    "INSERT INTO one_on_one_meetings(plan_id,employee_id,facilitator_email,held_at,notes,shared_with_employee,shared_with_manager) VALUES(?,?,?,?,?,?,?)",
  ).run(
    managerPlanId,
    employees[3].id,
    MANAGER_EMAIL,
    "2026-08-28T12:00:00.000Z",
    "Manager synthetic check-in",
    0,
    0,
  );
  db.prepare(
    "INSERT INTO people_tasks(title,description,category,assignee_employee_id,due_date,status,created_by_email) VALUES(?,?,?,?,?,?,?)",
  ).run(
    `Провести one-on-one: ${employees[3].firstName} ${employees[3].lastName}`,
    `Автоматично створено з плану one-on-one #${managerPlanId}.`,
    "general",
    employees[2].id,
    "2026-09-27",
    "todo",
    MANAGER_EMAIL,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM one_on_one_rules WHERE active=1 AND audience IN ('developers','managers','probation')",
      )
      .get().count,
    3,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM one_on_one_plans").get().count,
    hrPlans.length + 1,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM one_on_one_meetings").get().count,
    2,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM people_tasks WHERE category='general' AND status='todo'",
      )
      .get().count,
    hrPlans.length + 1,
  );
  return { plans: hrPlans.length + 1, meetings: 2 };
}

function simulateAssets(db, employees) {
  const assetId = Number(
    db
      .prepare(
        "INSERT INTO company_assets(name,asset_tag,category,status,assigned_employee_id,serial_number,note) VALUES(?,?,?,?,?,?,?) RETURNING id",
      )
      .get(
        "QA laptop",
        "QA-LAP-001",
        "equipment",
        "assigned",
        employees[3].id,
        "QA-SN-001",
        "Synthetic asset",
      ).id,
  );
  db.prepare(
    "INSERT INTO asset_events(asset_id,event_type,next_employee_id,next_status,actor_email) VALUES(?,?,?,?,?)",
  ).run(assetId, "created", employees[3].id, "assigned", ADMIN_EMAIL);
  db.prepare(
    "UPDATE company_assets SET status='available',assigned_employee_id=NULL,updated_at=? WHERE id=?",
  ).run("2026-08-28T12:00:00.000Z", assetId);
  db.prepare(
    "INSERT INTO asset_events(asset_id,event_type,previous_employee_id,next_status,previous_status,actor_email,note) VALUES(?,?,?,?,?,?,?)",
  ).run(
    assetId,
    "returned",
    employees[3].id,
    "available",
    "assigned",
    ADMIN_EMAIL,
    "Returned in simulation",
  );
  assert.equal(
    db.prepare("SELECT status FROM company_assets WHERE id=?").get(assetId)
      .status,
    "available",
  );
  return { assets: 1, events: 2 };
}

function simulateDocuments(db, employees) {
  const folder = db.prepare(
    "INSERT INTO employee_document_folders(employee_id,name,visibility,created_by_email) VALUES(?,?,?,?) RETURNING id",
  );
  const file = db.prepare(
    "INSERT INTO stored_files(id,kind,category,owner_employee_id,object_key,original_name,content_type,size_bytes,uploaded_by_email,folder_id,visibility) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  );
  const document = db.prepare(
    "INSERT INTO company_documents(folder_id,file_id,title) VALUES(?,?,?)",
  );
  for (let index = 0; index < employees.length; index += 1) {
    const employee = employees[index];
    const folderId = Number(
      folder.get(
        employee.id,
        "QA documents",
        index % 2 ? "hr_only" : "employee_hr",
        HR_EMAIL,
      ).id,
    );
    const fileId = `qa-document-${index + 1}`;
    file.run(
      fileId,
      "employee_document",
      "contract",
      employee.id,
      `employee_document/${employee.id}/${fileId}.pdf`,
      "contract.pdf",
      "application/pdf",
      1024,
      HR_EMAIL,
      folderId,
      index % 2 ? "hr_only" : "employee_hr",
    );
  }
  const genericFolderId = Number(
    db
      .prepare(
        "INSERT INTO document_folders(name,description,sort_order) VALUES(?,?,?) RETURNING id",
      )
      .get("QA company documents", "Synthetic company policies", 1).id,
  );
  const genericFileId = "qa-company-document";
  file.run(
    genericFileId,
    "employee_document",
    "policy",
    employees[0].id,
    "company_document/qa-company-document.pdf",
    "policy.pdf",
    "application/pdf",
    1024,
    HR_EMAIL,
    null,
    "hr_only",
  );
  document.run(genericFolderId, genericFileId, "Synthetic company policy");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM company_documents").get().count,
    1,
  );
  return { documents: 10, companyDocuments: 1 };
}

function simulateInventory(db) {
  const itemId = Number(
    db
      .prepare(
        "INSERT INTO office_inventory_items(kind,name,sku,category,quantity,minimum_quantity,storage_location,note) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
      )
      .get(
        "merchandise",
        "QA mugs",
        "QA-MUG-001",
        "merchandise",
        20,
        5,
        "QA stockroom",
        "Synthetic stock",
      ).id,
  );
  db.prepare(
    "INSERT INTO office_inventory_movements(item_id,quantity_before,quantity_after,reason,note,actor_email) VALUES(?,?,?,?,?,?)",
  ).run(itemId, 0, 20, "initial_stock", "Seeded for simulation", HR_EMAIL);
  db.prepare(
    "UPDATE office_inventory_items SET quantity=18,updated_at=? WHERE id=?",
  ).run("2026-08-28T13:00:00.000Z", itemId);
  db.prepare(
    "INSERT INTO office_inventory_movements(item_id,quantity_before,quantity_after,reason,note,actor_email) VALUES(?,?,?,?,?,?)",
  ).run(itemId, 20, 18, "distribution", "Two demo gifts", HR_EMAIL);
  assert.equal(
    db
      .prepare("SELECT quantity FROM office_inventory_items WHERE id=?")
      .get(itemId).quantity,
    18,
  );
  return { movements: 2 };
}

function simulateProfileRecords(db, employees, catalog) {
  const insert = db.prepare(
    "INSERT INTO employee_profile_records(employee_id,kind,title,subtitle,started_on,notes,reference_value_id) VALUES(?,?,?,?,?,?,?)",
  );
  let technologyRecords = 0;
  for (let index = 0; index < employees.length; index += 1) {
    const first = catalog.technologies[index % catalog.technologies.length];
    insert.run(
      employees[index].id,
      "skill",
      first.label,
      "Managed catalogue",
      "2025-01-15",
      "Synthetic skill",
      first.id,
    );
    technologyRecords += 1;
    if (index < 5) {
      const second =
        catalog.technologies[(index + 1) % catalog.technologies.length];
      insert.run(
        employees[index].id,
        "skill",
        second.label,
        "Managed catalogue",
        "2025-01-15",
        "Synthetic skill",
        second.id,
      );
      technologyRecords += 1;
    }
  }
  assert.throws(
    () =>
      insert.run(
        employees[0].id,
        "skill",
        catalog.technologies[0].label,
        "Duplicate",
        "2025-01-15",
        "Duplicate",
        catalog.technologies[0].id,
      ),
    /UNIQUE constraint failed/,
  );
  db.prepare(
    "UPDATE reference_values SET label='TypeScript Pro' WHERE id=?",
  ).run(catalog.technologies[0].id);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM employee_profile_records WHERE title='TypeScript Pro'",
      )
      .get().count,
    5,
  );
  return { technologyRecords };
}

function simulateBugReport(db, employees, users) {
  const fileId = "qa-bug-screenshot";
  db.prepare(
    "INSERT INTO stored_files(id,kind,category,owner_employee_id,object_key,original_name,content_type,size_bytes,uploaded_by_email) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run(
    fileId,
    "bug_screenshot",
    "bug",
    employees[0].id,
    "bug_screenshot/qa/qa-bug-screenshot.png",
    "bug.png",
    "image/png",
    2048,
    users[0].email,
  );
  db.prepare(
    "INSERT INTO bug_reports(reporter_email,employee_id,description,screenshot_file_id,status) VALUES(?,?,?,?,?)",
  ).run(
    users[0].email,
    employees[0].id,
    "Synthetic end-to-end report",
    fileId,
    "open",
  );
  db.prepare(
    "UPDATE bug_reports SET status='resolved',resolved_by_email=?,resolved_at=? WHERE reporter_email=?",
  ).run(ADMIN_EMAIL, "2026-08-28T14:00:00.000Z", users[0].email);
  assert.equal(
    db
      .prepare("SELECT status FROM bug_reports WHERE reporter_email=?")
      .get(users[0].email).status,
    "resolved",
  );
  return { reports: 1 };
}

function allEmployees(db, syntheticEmployees) {
  return [
    ...db
      .prepare(
        "SELECT id FROM employees WHERE email NOT LIKE '%@synthetic.incora.test' ORDER BY id",
      )
      .all(),
    ...syntheticEmployees,
  ];
}

function runIntegrityChecks(db) {
  return {
    foreignKeys: db
      .prepare("SELECT COUNT(*) AS count FROM pragma_foreign_key_check")
      .get().count,
    missingEmployeeAccounts: db
      .prepare(
        "SELECT COUNT(*) AS count FROM employees e LEFT JOIN users u ON u.employee_id=e.id WHERE u.id IS NULL",
      )
      .get().count,
    missingAccessPolicies: Math.max(
      0,
      4 -
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM access_policies WHERE role IN ('super_admin','hr_admin','manager','employee')",
          )
          .get().count,
    ),
    incompleteOrganizationReferences: db
      .prepare(
        "SELECT COUNT(*) AS count FROM employees WHERE division_unit_id IS NULL OR department_unit_id IS NULL OR position_value_id IS NULL OR employment_type_id IS NULL OR (team IS NOT NULL AND trim(team)<>'' AND team_unit_id IS NULL) OR (level IS NOT NULL AND trim(level)<>'' AND level_value_id IS NULL)",
      )
      .get().count,
    staleManagerNames: db
      .prepare(
        "SELECT COUNT(*) AS count FROM employees e JOIN employees m ON m.id=e.manager_id WHERE trim(coalesce(e.manager_name,''))<>trim(m.first_name || ' ' || m.last_name)",
      )
      .get().count,
    managerCycles: db
      .prepare(
        "SELECT COUNT(*) AS count FROM employees root WHERE EXISTS (WITH RECURSIVE chain(id,path,cycle) AS (SELECT root.manager_id,printf(',%d,',root.id),0 UNION ALL SELECT employee.manager_id,path || printf('%d,',employee.id),instr(path,printf(',%d,',employee.id))>0 FROM employees employee JOIN chain ON employee.id=chain.id WHERE chain.id IS NOT NULL AND chain.cycle=0) SELECT 1 FROM chain WHERE cycle=1)",
      )
      .get().count,
    leaveLedgerMismatches: db
      .prepare(
        "SELECT COUNT(*) AS count FROM leave_balances b WHERE abs(b.used-coalesce((SELECT sum(l.delta) FROM leave_ledger l WHERE l.employee_id=b.employee_id AND l.leave_type_id=b.leave_type_id AND l.year=b.year),0))>0.0001",
      )
      .get().count,
    missingCurrentYearBalances: db
      .prepare(
        "SELECT COUNT(*) AS count FROM employees e CROSS JOIN leave_types t LEFT JOIN leave_balances b ON b.employee_id=e.id AND b.leave_type_id=t.id AND b.year=? WHERE e.status='active' AND b.id IS NULL",
      )
      .get(YEAR).count,
    orphanFiles: db
      .prepare(
        "SELECT COUNT(*) AS count FROM stored_files f LEFT JOIN employees e ON e.id=f.owner_employee_id WHERE f.owner_employee_id IS NOT NULL AND e.id IS NULL",
      )
      .get().count,
    duplicateOpenTimeEmployees: db
      .prepare(
        "SELECT COUNT(*) AS count FROM (SELECT employee_id FROM time_entries WHERE clock_out IS NULL GROUP BY employee_id HAVING COUNT(*)>1)",
      )
      .get().count,
    duplicateEmployeeUserLinks: db
      .prepare(
        "SELECT COUNT(*) AS count FROM (SELECT employee_id FROM users WHERE employee_id IS NOT NULL GROUP BY employee_id HAVING COUNT(*)>1)",
      )
      .get().count,
    invalidTechnologyReferences: db
      .prepare(
        "SELECT COUNT(*) AS count FROM employee_profile_records record LEFT JOIN reference_values value ON value.id=record.reference_value_id AND value.kind='technology' WHERE record.kind='skill' AND (value.id IS NULL OR value.label<>record.title)",
      )
      .get().count,
    legacyCompensationRecords: db
      .prepare(
        "SELECT COUNT(*) AS count FROM employee_profile_records WHERE kind='compensation'",
      )
      .get().count,
  };
}
