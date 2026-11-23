import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspacePath = new URL(
  "../components/inventory/InventoryWorkspace.tsx",
  import.meta.url,
);
const workspace = await readFile(workspacePath, "utf8");
const api = await readFile(
  new URL("../app/api/inventory/route.ts", import.meta.url),
  "utf8",
);
const queries = await readFile(
  new URL("../modules/inventory/queries.ts", import.meta.url),
  "utf8",
);

test("inventory overview exposes compact location/count access without standalone panels", () => {
  assert.match(workspace, /setLocationsDialogOpen\(true\)/);
  assert.match(workspace, /setCountsDialogOpen\(true\)/);
  assert.match(workspace, /inventory-counts-dialog/);
  assert.match(workspace, /inventory-locations-dialog/);
  assert.doesNotMatch(workspace, /<h2>\{t\("Physical verification"\)\}<\/h2>/);
  assert.doesNotMatch(workspace, /Set initial stock/);
});

test("item list shows a single aggregate quantity and keeps minimum separate", () => {
  assert.match(
    queries,
    /item\.totalQuantity \+= Number\(row\.quantity \?\? 0\)/,
  );
  assert.match(
    queries,
    /item\.minimumTotal \+= Number\(row\.minimumQuantity \?\? 0\)/,
  );
  assert.match(
    workspace,
    /<strong>\s*\{item\.totalQuantity\} \{item\.unit\}\s*<\/strong>/,
  );
  assert.match(
    workspace,
    /<strong>\s*\{item\.minimumTotal\} \{item\.unit\}\s*<\/strong>/,
  );
  assert.doesNotMatch(workspace, /visibleItems\.map\(\(item, index\)/);
});

test("count initiation requires explicit location and item scope while preserving blank input", () => {
  assert.match(workspace, /setCountLocationId\(null\)/);
  assert.match(workspace, /type: "item",\s*id: selectedItem\.id/);
  assert.match(
    workspace,
    /setCountItemIds\(scope\?\.type === "item" \? \[scope\.id\] : \[\]\)/,
  );
  assert.match(
    workspace,
    /First choose a storage location to see its quantities and select items\./,
  );
  assert.match(workspace, /value=\{countInputs\[line\.itemId\] \?\? ""\}/);
  assert.match(workspace, /countInputs\[line\.itemId\] !== ""/);
  assert.match(api, /count\.create/);
  assert.match(api, /count\.finalize/);
  assert.match(api, /validateCountSelection\(/);
});

test("draft count save preserves blank as NULL, zero as an actual count, and blocks incomplete finalization", async () => {
  const contracts = await readFile(
    new URL("../modules/inventory/contracts.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    workspace,
    /count\.lines\.map\(\(line\) => \{\s*const value = countInputs\[line\.itemId\] \?\? "";\s*return \{\s*itemId: line\.itemId,\s*countedQuantity: value === "" \? null : Number\(value\)/,
  );
  assert.match(
    workspace,
    /lines\.some\(\(line\) => line\.countedQuantity === null\)/,
  );
  assert.match(contracts, /countedQuantity:[\s\S]*?\.nullable\(\)/);
  assert.match(api, /UPDATE inventory_count_lines SET counted_quantity=\?/);
});

test("inventory stock operation display uses HR-approved Ukrainian labels without changing stored types", async () => {
  const i18n = await readFile(
    new URL("../lib/i18n.ts", import.meta.url),
    "utf8",
  );
  assert.match(workspace, /receipt: "Receipt"/);
  assert.match(workspace, /decrease: "Write-off"/);
  assert.match(i18n, /Receipt: "Прихід"/);
  assert.match(i18n, /"Write-off": "Списання"/);
  assert.match(api, /operation_type/);
  assert.match(api, /operationType === "decrease"/);
});
