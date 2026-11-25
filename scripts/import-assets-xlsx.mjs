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
// "Ноутбук,Монітор"). Rows are upserted by asset code. The holder is linked to
// an employee when the name matches exactly; otherwise the name is kept as
// text. The export contains real people's data: keep the input and the
// generated SQL out of the repository and never run them against --remote.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const categoryKeys = {
  Ноутбук: "laptop",
  Монітор: "monitor",
  Телефон: "phone",
  Зарядні: "charger",
  Шнури: "cables",
  Інше: "other",
  Кавомашина: "coffee_machine",
  "Мікрохвильова піч": "microwave",
  Порохотяг: "vacuum",
  Списано: "written_off",
};
const attributeColumns = {
  Модель: "Model",
  Рік: "Year",
  Діагональ: "Screen size",
  Процесор: "Processor",
  "Пам`ять": "Memory",
  SSD: "SSD",
};

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

/** Excel stores dates as days since 1899-12-30. */
function excelDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const days = Number(value);
  if (!Number.isFinite(days)) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const sql = (value) =>
  value === null || value === undefined || value === ""
    ? "NULL"
    : `'${String(value).replaceAll("'", "''")}'`;
const text = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;

const [input, output, categoryArg = "Ноутбук,Монітор"] = process.argv.slice(2);
if (!input || !output) {
  console.error(
    "Usage: node scripts/import-assets-xlsx.mjs <export.xlsx> <output.sql> [categories]",
  );
  process.exit(1);
}
const wanted = new Set(categoryArg.split(",").map((item) => item.trim()));
const [header, ...body] = readSheet(input);
const column = Object.fromEntries(header.map((name, index) => [name, index]));
for (const required of ["Код", "Назва", "Категорія"])
  if (!(required in column)) throw new Error(`Missing column: ${required}`);
const cell = (row, name) => (name in column ? (row[column[name]] ?? "") : "");

const statements = [];
const counts = {};
for (const row of body) {
  const sourceCategory = cell(row, "Категорія");
  const tag = cell(row, "Код").toUpperCase();
  if (!wanted.has(sourceCategory) || !tag) continue;
  counts[sourceCategory] = (counts[sourceCategory] ?? 0) + 1;
  const holder = cell(row, "Призначено");
  const attributes = Object.entries(attributeColumns)
    .map(([source, label]) => ({ label, value: cell(row, source) }))
    .filter((item) => item.value);
  const employee = holder
    ? `(SELECT id FROM employees WHERE lower(trim(first_name) || ' ' || trim(last_name)) = lower(${text(holder)}) ORDER BY id LIMIT 1)`
    : "NULL";
  statements.push(`INSERT INTO company_assets
  (name, asset_tag, category, status, assigned_employee_id, serial_number,
   price, location, division, department, warranty_ends, description,
   repair_history, attributes_json, assigned_since, assignee_name, updated_at)
VALUES
  (${text(cell(row, "Назва"))}, ${text(tag)},
   ${text(categoryKeys[sourceCategory] ?? "other")},
   ${text(holder ? "assigned" : "available")}, ${employee},
   ${text(cell(row, "Серійний номер"))}, ${text(cell(row, "Ціна"))},
   ${text(cell(row, "Локація"))}, ${text(cell(row, "Підрозділ"))},
   ${text(cell(row, "Департамент"))},
   ${sql(excelDate(cell(row, "Гарантія закінчується")))},
   ${text(cell(row, "Опис"))}, ${text(cell(row, "Repair History"))},
   ${text(JSON.stringify(attributes))},
   ${sql(holder ? excelDate(cell(row, "Видано")) : null)},
   ${text(holder)}, CURRENT_TIMESTAMP)
ON CONFLICT(asset_tag) DO UPDATE SET
  name = excluded.name, category = excluded.category, status = excluded.status,
  assigned_employee_id = excluded.assigned_employee_id,
  serial_number = excluded.serial_number, price = excluded.price,
  location = excluded.location, division = excluded.division,
  department = excluded.department, warranty_ends = excluded.warranty_ends,
  description = excluded.description, repair_history = excluded.repair_history,
  attributes_json = excluded.attributes_json,
  assigned_since = excluded.assigned_since,
  assignee_name = excluded.assignee_name, updated_at = CURRENT_TIMESTAMP;`);
}
// A matched employee becomes the source of truth for the holder's name.
statements.push(
  "UPDATE company_assets SET assignee_name = '' WHERE assigned_employee_id IS NOT NULL;",
);
writeFileSync(output, `${statements.join("\n")}\n`);
console.log(
  `Wrote ${statements.length - 1} assets to ${output}:`,
  JSON.stringify(counts),
);
