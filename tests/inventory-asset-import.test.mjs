import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  buildInventoryAssetImportSql,
  parseCsv,
  registerDate,
} from "../scripts/lib/inventory-asset-import.mjs";

const root = new URL("../", import.meta.url);
const header = [
  "Код",
  "Назва",
  "Категорія",
  "Опис",
  "Серійний номер",
  "Ціна",
  "Підрозділ",
  "Департамент",
  "Процесор",
  "Призначено",
  "Видано",
];

/** Full schema from every runtime migration, including 0073. */
async function database() {
  const db = new DatabaseSync(":memory:");
  const files = (await readdir(new URL("migrations/", root)))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const transactional = file === "0065_employee_profile_compensation.sql";
    if (transactional) db.exec("BEGIN;");
    db.exec(await readFile(new URL(`migrations/${file}`, root), "utf8"));
    if (transactional) db.exec("COMMIT;");
  }
  // Org-structure triggers on employees are irrelevant here; drop them so a
  // single synthetic employee can be inserted without a full org chart.
  for (const { name } of db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'employees'",
    )
    .all())
    db.exec(`DROP TRIGGER "${name}"`);
  db.exec(`
    INSERT INTO employees (first_name, last_name, email, job_title, department, start_date)
      VALUES ('Demo', 'Person', 'demo@example.test', 'CTO', 'Engineering', '2024-01-01');
    INSERT INTO inventory_categories (name, created_by_email, updated_by_email)
      VALUES ('Техніка', 'system', 'system');
    INSERT INTO inventory_groups (category_id, name, created_by_email, updated_by_email)
      VALUES (1, 'Ноутбук', 'system', 'system'), (1, 'Списано', 'system', 'system');
    INSERT INTO inventory_items (group_id, sku, name, created_by_email, updated_by_email)
      VALUES (1, '002', 'Laptop A', 'system', 'system'),
             (1, 'Left A6', 'Laptop B', 'system', 'system'),
             (2, '065', 'Old laptop', 'system', 'system');
  `);
  return db;
}

const run = (db, rows) =>
  db.exec(buildInventoryAssetImportSql(header, rows).sql);
const item = (db, sku) =>
  db
    .prepare(
      `SELECT serial_number AS serial, price, department, description,
        attributes_json AS attributes, assigned_employee_id AS employeeId,
        assignee_name AS holder, assigned_since AS since
      FROM inventory_items WHERE sku = ?`,
    )
    .get(sku);

test("register details fill inventory items matched by code", async () => {
  const db = await database();
  run(db, [
    [
      "002",
      "",
      "Ноутбук",
      "",
      "СW5",
      "$1,000",
      "Ukraine",
      "Development",
      "M3",
      "Demo Person",
      "24.01.2025",
    ],
    [
      "left a6",
      "",
      "Ноутбук",
      "note",
      "SN-2",
      "",
      "",
      "",
      "",
      "Someone Else",
      "",
    ],
    ["999", "", "Ноутбук", "", "SN-9", "", "", "", "", "", ""],
  ]);
  // Codes padded with spaces still match; repeated runs log one event per item.
  db.exec("UPDATE inventory_items SET sku = '065 ' WHERE sku = '065'");
  run(db, [["065", "", "Списано", "", "SN-6", "", "", "", "", "", ""]]);
  assert.equal(item(db, "065 ").serial, "SN-6");
  run(db, [["002", "", "Ноутбук", "", "", "", "", "", "", "", ""]]);
  assert.deepEqual(
    { ...item(db, "002") },
    {
      serial: "CW5",
      price: "$1,000",
      department: "Development",
      description: "",
      attributes: '[{"label":"Процесор","value":"M3"}]',
      employeeId: db
        .prepare("SELECT id FROM employees WHERE email = 'demo@example.test'")
        .get().id,
      holder: "",
      since: "2025-01-24",
    },
  );
  assert.equal(item(db, "Left A6").holder, "Someone Else");
  assert.equal(item(db, "Left A6").description, "note");
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM inventory_items").get().n,
    3,
  );
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS n FROM inventory_catalog_events WHERE actor_email = 'system:asset-register-import'",
      )
      .get().n,
    3,
  );
});

test("re-import never overwrites values entered in the app", async () => {
  const db = await database();
  run(db, [
    ["002", "", "Ноутбук", "", "SN-1", "$1", "", "", "", "Demo Person", ""],
  ]);
  db.exec(
    "UPDATE inventory_items SET serial_number = 'SN-APP', assigned_employee_id = NULL, assignee_name = 'Returned', assigned_since = NULL WHERE sku = '002'",
  );
  run(db, [
    ["002", "", "Ноутбук", "", "SN-NEW", "$2", "", "", "", "Demo Person", ""],
  ]);
  assert.equal(item(db, "002").serial, "SN-APP");
  assert.equal(item(db, "002").price, "$1");
  assert.equal(item(db, "002").holder, "Returned");
  assert.equal(item(db, "002").employeeId, null);
});

test("written-off rows never get a holder", async () => {
  const db = await database();
  run(db, [
    ["065", "", "Списано", "sold", "SN-6", "", "", "", "", "Demo Person", ""],
  ]);
  assert.equal(item(db, "065").employeeId, null);
  assert.equal(item(db, "065").holder, "");
  assert.equal(item(db, "065").serial, "SN-6");
});

test("CSV parsing and register dates", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, ""y""",\n'), [
    ["a", "b"],
    ['x, "y"', ""],
  ]);
  assert.equal(registerDate("4.1.2025"), "2025-01-04");
  assert.equal(registerDate("45769"), "2025-04-22");
  assert.equal(registerDate(""), null);
});
