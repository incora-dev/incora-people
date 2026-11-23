import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("backup restore drill validates a disposable snapshot", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "incora-backup-test-"),
  );
  const backup = path.join(directory, "backup.json");
  await writeFile(
    backup,
    JSON.stringify({
      format: "incora-people-backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      exportedBy: "qa@synthetic.incora.test",
      data: {
        employeePrivateDetails: [],
        employeeCompensations: [],
        inventoryCategories: [],
        inventoryStorageLocations: [],
        inventoryGroups: [],
        inventoryItems: [],
        inventoryItemStocks: [],
        inventoryCounts: [],
        inventoryCountLines: [],
        inventoryCorrections: [],
        inventoryOperations: [],
        inventoryStockMovements: [],
        inventoryCatalogEvents: [],
        inventoryCountEvents: [],
        r2Recovery: { objectKeys: [] },
      },
    }),
  );

  try {
    const result = await runNode([
      path.join(root, "scripts/backup-restore-drill.mjs"),
      backup,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /BACKUP_RESTORE_DRILL/);
    assert.match(result.stdout, /"foreignKeys":0/);
    assert.match(result.stdout, /"integrity":"ok"/);
    const report = JSON.parse(
      result.stdout.replace(/^BACKUP_RESTORE_DRILL /, ""),
    );
    for (const key of [
      "employeePrivateDetails",
      "employeeCompensations",
      "inventoryCategories",
      "inventoryStorageLocations",
      "inventoryGroups",
      "inventoryItems",
      "inventoryItemStocks",
      "inventoryCounts",
      "inventoryCountLines",
      "inventoryCorrections",
      "inventoryOperations",
      "inventoryStockMovements",
      "inventoryCatalogEvents",
      "inventoryCountEvents",
    ])
      assert.ok(report.restoredTables.includes(key), `${key} was not restored`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}
