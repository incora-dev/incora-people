import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  buildAssetImportSql,
  normalizeSerialNumber,
} from "../scripts/lib/asset-import-sql.mjs";

const root = new URL("../", import.meta.url);
const header = ["Код", "Назва", "Категорія", "Серійний номер", "Призначено"];

async function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE employees (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL
  );`);
  const original = await readFile(
    new URL("migrations/0013_assets_and_knowledge.sql", root),
    "utf8",
  );
  db.exec(
    original
      .split("--> statement-breakpoint")
      .filter((statement) => statement.includes("company_assets"))
      .join(";\n"),
  );
  db.exec(
    await readFile(
      new URL("migrations/0072_asset_register_details.sql", root),
      "utf8",
    ),
  );
  db.exec(
    "INSERT INTO employees (first_name, last_name) VALUES ('Demo', 'Person');",
  );
  return db;
}

const run = (db, rows, categories = ["Ноутбук", "Списано"]) =>
  db.exec(buildAssetImportSql(header, rows, new Set(categories)).sql);
const asset = (db, tag) =>
  db
    .prepare(
      "SELECT status, assigned_employee_id AS employeeId, assignee_name AS holder, serial_number AS serial FROM company_assets WHERE asset_tag = ?",
    )
    .get(tag);

test("first import sets status and links holders by exact name", async () => {
  const db = await database();
  run(db, [
    ["001", "Laptop A", "Ноутбук", "SN-1", "Demo Person"],
    ["002", "Laptop B", "Ноутбук", "SN-2", "Someone Unknown"],
    ["003", "Laptop C", "Ноутбук", "SN-3", ""],
  ]);
  assert.deepEqual(
    { ...asset(db, "001") },
    { status: "assigned", employeeId: 1, holder: "", serial: "SN-1" },
  );
  assert.equal(asset(db, "002").holder, "Someone Unknown");
  assert.equal(asset(db, "003").status, "available");
});

test("re-import keeps status and holder changed in the app", async () => {
  const db = await database();
  run(db, [
    ["001", "Laptop A", "Ноутбук", "SN-1", "Demo Person"],
    ["002", "Laptop B", "Ноутбук", "SN-2", ""],
  ]);
  db.exec(
    "UPDATE company_assets SET status = 'repair', assigned_employee_id = NULL WHERE asset_tag = '001';",
  );
  db.exec(
    "UPDATE company_assets SET status = 'assigned', assigned_employee_id = 1 WHERE asset_tag = '002';",
  );
  run(db, [
    ["001", "Laptop A", "Ноутбук", "SN-1-new", "Demo Person"],
    ["002", "Laptop B", "Ноутбук", "SN-2", ""],
  ]);
  assert.equal(asset(db, "001").status, "repair");
  assert.equal(asset(db, "001").employeeId, null);
  assert.equal(asset(db, "001").serial, "SN-1-new");
  assert.equal(asset(db, "002").status, "assigned");
  assert.equal(asset(db, "002").employeeId, 1);
});

test("written-off rows are imported and re-imported as retired", async () => {
  const db = await database();
  run(db, [
    ["001", "Old laptop", "Списано", "SN-1", "Demo Person"],
    ["002", "Laptop B", "Ноутбук", "SN-2", "Demo Person"],
  ]);
  assert.deepEqual(
    { ...asset(db, "001") },
    { status: "retired", employeeId: null, holder: "", serial: "SN-1" },
  );
  run(db, [["002", "Laptop B", "Списано", "SN-2", "Demo Person"]]);
  assert.equal(asset(db, "002").status, "retired");
  assert.equal(asset(db, "002").employeeId, null);
});

test("serial numbers replace Cyrillic look-alikes with Latin letters", async () => {
  assert.equal(
    normalizeSerialNumber("\u0421W5JH4ZR600561K"),
    "CW5JH4ZR600561K",
  );
  const db = await database();
  run(db, [["001", "Monitor", "Ноутбук", "\u0421W5\u041d", ""]]);
  assert.equal(asset(db, "001").serial, "CW5H");
});
