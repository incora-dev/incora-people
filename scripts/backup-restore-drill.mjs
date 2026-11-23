#!/usr/bin/env node

/**
 * Disposable backup restore drill.
 *
 * This deliberately restores only into an in-memory SQLite database. It never
 * writes to a Cloudflare D1 database or an R2 bucket. The goal is to prove
 * that the administrator JSON snapshot can be replayed into the current
 * schema without losing rows or violating foreign keys.
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupPath = process.argv[2] || process.env.BACKUP_FILE;

const tableMap = {
  employees: "employees",
  users: "users",
  employmentHistory: "employment_history",
  accessPolicies: "access_policies",
  leaveTypes: "leave_types",
  leaveBalances: "leave_balances",
  leaveRequests: "leave_requests",
  companyHolidays: "company_holidays",
  workSchedules: "work_schedules",
  timeEntries: "time_entries",
  breakEntries: "break_entries",
  bugReports: "bug_reports",
  timeCorrections: "time_corrections",
  timesheetPeriods: "timesheet_periods",
  reimbursementPolicies: "reimbursement_policies",
  reimbursementRequests: "reimbursement_requests",
  storedFiles: "stored_files",
  orgUnits: "org_units",
  peopleTasks: "people_tasks",
  notifications: "notifications",
  notificationOutbox: "notification_outbox",
  auditEvents: "audit_events",
  workModeEntries: "work_mode_entries",
  gameScores: "game_scores",
  companyAssets: "company_assets",
  assetEvents: "asset_events",
  documentFolders: "document_folders",
  companyDocuments: "company_documents",
  knowledgeArticles: "knowledge_articles",
  knowledgeArticleAccess: "knowledge_article_access",
  knowledgeSections: "knowledge_sections",
  officeInventoryItems: "office_inventory_items",
  officeInventoryMovements: "office_inventory_movements",
  inventoryCategories: "inventory_categories",
  inventoryStorageLocations: "inventory_storage_locations",
  inventoryGroups: "inventory_groups",
  inventoryItems: "inventory_items",
  inventoryItemStocks: "inventory_item_stocks",
  inventoryCounts: "inventory_counts",
  inventoryCountLines: "inventory_count_lines",
  inventoryCorrections: "inventory_corrections",
  inventoryOperations: "inventory_operations",
  inventoryStockMovements: "inventory_stock_movements",
  inventoryCatalogEvents: "inventory_catalog_events",
  inventoryCountEvents: "inventory_count_events",
  oneOnOneRules: "one_on_one_rules",
  oneOnOnePlans: "one_on_one_plans",
  oneOnOneMeetings: "one_on_one_meetings",
  referenceValues: "reference_values",
  employmentTypes: "employment_types",
  systemSettings: "system_settings",
  leaveLedger: "leave_ledger",
  protectedAdminAccounts: "protected_admin_accounts",
  companyEvents: "company_events",
  announcements: "announcements",
  announcementDismissals: "announcement_dismissals",
  announcementComments: "announcement_comments",
  announcementReactions: "announcement_reactions",
  announcementPolls: "announcement_polls",
  announcementPollResponses: "announcement_poll_responses",
  announcementDeliveries: "announcement_deliveries",
  companyLinks: "company_links",
  timeProjects: "time_projects",
  employeeProfileRecords: "employee_profile_records",
  employeePrivateDetails: "employee_private_details",
  employeeCompensations: "employee_compensations",
  employeeDocumentFolders: "employee_document_folders",
};

if (!backupPath) {
  console.error("Usage: node scripts/backup-restore-drill.mjs <backup.json>");
  process.exitCode = 2;
} else {
  const result = await runRestoreDrill(path.resolve(backupPath));
  console.log(`BACKUP_RESTORE_DRILL ${JSON.stringify(result)}`);
}

async function runRestoreDrill(filePath) {
  const snapshot = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(snapshot.format, "incora-people-backup");
  assert.equal(snapshot.version, 2);
  assert.ok(snapshot.data && typeof snapshot.data === "object");
  const supportedKeys = new Set([...Object.keys(tableMap), "r2Recovery"]);
  for (const key of Object.keys(snapshot.data)) {
    assert.ok(supportedKeys.has(key), `Unsupported backup section: ${key}`);
  }

  const db = new DatabaseSync(":memory:");
  try {
    for (const file of (await readdir(path.join(root, "migrations")))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      const migration = await readFile(
        path.join(root, "migrations", file),
        "utf8",
      );
      if (file === "0065_employee_profile_compensation.sql") db.exec("BEGIN;");
      db.exec(migration);
      if (file === "0065_employee_profile_compensation.sql") db.exec("COMMIT;");
    }

    // The source snapshot is expected to be internally consistent. Foreign
    // keys and data-integrity triggers are disabled only during insertion:
    // child tables can appear before their parents in a JSON export and the
    // schema's triggers intentionally reject references until all catalogs
    // have been restored. Both are enabled again before verification.
    const triggers = db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL",
      )
      .all();
    for (const trigger of triggers) {
      db.exec(`DROP TRIGGER ${quoteIdentifier(trigger.name)}`);
    }
    db.exec("PRAGMA foreign_keys = OFF");
    // A migration history can contain demo/catalog rows (for example the
    // built-in announcement and reference catalog). The drill models a
    // restore into an empty target, so remove those rows before replaying the
    // snapshot and keep the exported primary keys intact.
    for (const table of new Set(Object.values(tableMap))) {
      db.exec(`DELETE FROM ${quoteIdentifier(table)}`);
    }
    const counts = {};
    for (const [key, table] of Object.entries(tableMap)) {
      const rows = snapshot.data[key];
      if (!Array.isArray(rows)) continue;
      counts[key] = rows.length;
      if (rows.length === 0) continue;

      const columns = new Set(
        db
          .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
          .all()
          .map((column) => column.name),
      );
      assert.ok(columns.size > 0, `Missing table in current schema: ${table}`);

      for (const row of rows) {
        assert.ok(
          row && typeof row === "object",
          `${key} contains invalid row`,
        );
        const entries = Object.entries(row)
          .map(([column, value]) => [camelToSnake(column), value])
          .filter(([column]) => columns.has(column));
        const unknownColumns = Object.keys(row)
          .map(camelToSnake)
          .filter((column) => !columns.has(column));
        assert.deepEqual(
          unknownColumns,
          [],
          `${key} contains columns absent from the current schema`,
        );
        assert.ok(entries.length > 0, `${key} contains an empty row`);
        const names = entries.map(([column]) => quoteIdentifier(column));
        const placeholders = entries.map(() => "?").join(", ");
        try {
          db.prepare(
            `INSERT INTO ${quoteIdentifier(table)} (${names.join(", ")}) VALUES (${placeholders})`,
          ).run(...entries.map(([, value]) => sqliteValue(value)));
        } catch (error) {
          throw new Error(
            `Could not restore ${key} row ${JSON.stringify(row)}: ${error.message}`,
            { cause: error },
          );
        }
      }
    }
    db.exec("PRAGMA foreign_keys = ON");
    for (const trigger of triggers) db.exec(trigger.sql);

    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(
      foreignKeys,
      [],
      "restored snapshot has broken foreign keys",
    );
    const integrity = db.prepare("PRAGMA integrity_check").get();
    assert.equal(integrity.integrity_check, "ok");

    const restoredCounts = {};
    for (const [key, table] of Object.entries(tableMap)) {
      if (!(key in counts)) continue;
      restoredCounts[key] = Number(
        db
          .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`)
          .get().count,
      );
      assert.equal(
        restoredCounts[key],
        counts[key],
        `${key} row count changed`,
      );
    }

    const r2Keys = snapshot.data.r2Recovery?.objectKeys;
    assert.ok(Array.isArray(r2Keys), "r2Recovery.objectKeys is missing");
    assert.equal(
      new Set(r2Keys).size,
      r2Keys.length,
      "R2 object key manifest contains duplicates",
    );

    return {
      source: path.basename(filePath),
      version: snapshot.version,
      tables: Object.keys(counts).length,
      restoredTables: Object.keys(restoredCounts),
      rows: Object.values(counts).reduce((sum, count) => sum + count, 0),
      r2ObjectKeys: r2Keys.length,
      foreignKeys: foreignKeys.length,
      integrity: integrity.integrity_check,
    };
  } finally {
    db.close();
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function camelToSnake(value) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function sqliteValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number") return value;
  throw new TypeError(`Unsupported JSON value type: ${typeof value}`);
}
