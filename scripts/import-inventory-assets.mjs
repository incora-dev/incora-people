#!/usr/bin/env node
// Adds asset register details from an "exports-asset" CSV to existing office
// inventory items (matched by code). See scripts/lib/inventory-asset-import.mjs
// for the rules; existing values entered in the app are never overwritten.
//
//   node scripts/import-inventory-assets.mjs <export.csv> <output.sql>
//   # run every written part in order:
//   npx wrangler d1 execute incora-people --local \
//     --persist-to "$PWD/.wrangler/state" --file <part.sql> -c <config>
//
// The export contains personal data: keep the input and the generated SQL out
// of the repository. Applying it to the remote database is a production data
// change and needs explicit approval and a fresh backup first.
import { readFileSync, writeFileSync } from "node:fs";
import {
  buildInventoryAssetImportSql,
  parseCsv,
} from "./lib/inventory-asset-import.mjs";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error(
    "Usage: node scripts/import-inventory-assets.mjs <export.csv> <output.sql>",
  );
  process.exit(1);
}
const [header, ...body] = parseCsv(readFileSync(input, "utf8"));
const { statements, rows } = buildInventoryAssetImportSql(header, body);
// D1 rejects very large files in one batch (SQLITE_TOOBIG), so the SQL is
// split into parts of at most ~80 KB; run them in order.
const parts = [];
let current = "";
for (const statement of statements) {
  if (current && Buffer.byteLength(current + statement) > 80_000) {
    parts.push(current);
    current = "";
  }
  current += `${statement}\n`;
}
if (current) parts.push(current);
const files = parts.map((part, index) => {
  const file =
    parts.length === 1
      ? output
      : output.replace(
          /(\.sql)?$/,
          `.part${String(index + 1).padStart(2, "0")}.sql`,
        );
  writeFileSync(file, part);
  return file;
});
console.log(`Wrote updates for ${rows} register rows to:\n${files.join("\n")}`);
