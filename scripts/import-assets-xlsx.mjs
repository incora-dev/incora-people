#!/usr/bin/env node
// Converts an asset register export (.xlsx) into SQL for the LOCAL database.
//
//   node scripts/import-assets-xlsx.mjs <export.xlsx> <output.sql> [categories]
//   npm run build
//   npx wrangler d1 execute incora-people --local \
//     --persist-to "$PWD/.wrangler/state" --file <output.sql> \
//     -c dist/server/wrangler.json
//
// categories: comma-separated register categories to import (default
// "Ноутбук,Монітор"; add "Списано" to import write-offs as retired). Rows are
// upserted by asset code; on re-import status and holder already managed in
// the app are kept (see scripts/lib/asset-import-sql.mjs). The holder is linked
// to an employee when the name matches exactly; otherwise the name is kept as
// text. The export contains real people's data: keep the input and the
// generated SQL out of the repository and never run them against --remote.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { buildAssetImportSql } from "./lib/asset-import-sql.mjs";

function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("Not an .xlsx (zip) file.");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const dataStart =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(dataStart, dataStart + size);
    files.set(name, method === 8 ? inflateRawSync(data) : data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const decode = (text) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
const texts = (xml) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((match) => decode(match[1]))
    .join("");

function columnIndex(ref) {
  let index = 0;
  for (const char of ref.match(/^[A-Z]+/)[0])
    index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function readSheet(path) {
  const files = unzip(readFileSync(path));
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    texts(m[1]),
  );
  const sheet = files.get("xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!sheet) throw new Error("The workbook has no first sheet.");
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells = [];
    for (const cell of row[1].matchAll(
      /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const ref = cell[1].match(/r="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const type = cell[1].match(/t="([^"]+)"/)?.[1];
      const raw = cell[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      cells[columnIndex(ref)] =
        type === "s"
          ? shared[Number(raw)]
          : type === "inlineStr"
            ? texts(cell[2] ?? "")
            : raw === undefined
              ? ""
              : decode(raw);
    }
    return Array.from(cells, (value) => (value ?? "").trim());
  });
}

const [input, output, categoryArg = "Ноутбук,Монітор"] = process.argv.slice(2);
if (!input || !output) {
  console.error(
    "Usage: node scripts/import-assets-xlsx.mjs <export.xlsx> <output.sql> [categories]",
  );
  process.exit(1);
}
const wanted = new Set(categoryArg.split(",").map((item) => item.trim()));
const [header, ...body] = readSheet(input);
const { sql, counts } = buildAssetImportSql(header, body, wanted);
writeFileSync(output, `${sql}\n`);
const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
console.log(`Wrote ${total} assets to ${output}:`, JSON.stringify(counts));
