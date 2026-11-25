// Builds SQL that adds asset register details (an "exports-asset" CSV) to
// existing office inventory items. Used by scripts/import-inventory-assets.mjs;
// kept free of file I/O so it can be tested.
//
// Rules — the import never overwrites what was entered in the app:
// - Rows are matched to inventory items by code (SKU), ignoring case and
//   surrounding spaces. Rows
//   without a matching item are skipped; nothing is created.
// - Each item gets one catalog event for the import, however often it runs.
// - Each detail field is written only while it is still empty on the item.
// - The holder is written only while the item has no holder at all. A holder
//   is linked to an employee on an exact name match, otherwise kept as text.
// - Rows in the "Списано" (written-off) category never get a holder.
import { excelDate, normalizeSerialNumber } from "./asset-import-sql.mjs";

export const WRITTEN_OFF_CATEGORY = "Списано";

const attributeColumns = {
  Модель: "Модель",
  Рік: "Рік",
  Діагональ: "Діагональ",
  Процесор: "Процесор",
  "Пам`ять": "Пам’ять",
  SSD: "SSD",
};

/** Accepts ISO dates, Excel serial days and dd.mm.yyyy. */
export function registerDate(value) {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value ?? "");
  if (match)
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return excelDate(value);
}

/** RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF, BOM). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

const text = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
const nullable = (value) => (value ? text(value) : "NULL");
const fillEmpty = (column, value) =>
  `${column} = CASE WHEN ${column} = '' THEN ${text(value)} ELSE ${column} END`;
const fillNull = (column, value) =>
  `${column} = COALESCE(${column}, ${nullable(value)})`;

/**
 * @param {string[]} header first CSV row
 * @param {string[][]} body remaining rows
 */
export function buildInventoryAssetImportSql(header, body) {
  const column = Object.fromEntries(
    header.map((name, index) => [name.trim(), index]),
  );
  for (const required of ["Код", "Категорія"])
    if (!(required in column)) throw new Error(`Missing column: ${required}`);
  const cell = (row, name) =>
    name in column ? String(row[column[name]] ?? "").trim() : "";

  const statements = [];
  let rows = 0;
  for (const row of body) {
    const code = cell(row, "Код");
    if (!code) continue;
    rows += 1;
    const match = `lower(trim(sku)) = lower(${text(code)})`;
    const attributes = Object.entries(attributeColumns)
      .map(([source, label]) => ({ label, value: cell(row, source) }))
      .filter((item) => item.value);
    const holder =
      cell(row, "Категорія") === WRITTEN_OFF_CATEGORY
        ? ""
        : cell(row, "Призначено");
    const employee = `(SELECT id FROM employees WHERE lower(trim(first_name) || ' ' || trim(last_name)) = lower(${text(holder)}) ORDER BY id LIMIT 1)`;
    const updates = [
      fillEmpty(
        "serial_number",
        normalizeSerialNumber(cell(row, "Серійний номер")),
      ),
      fillEmpty("price", cell(row, "Ціна")),
      fillEmpty("division", cell(row, "Підрозділ")),
      fillEmpty("department", cell(row, "Департамент")),
      fillNull(
        "warranty_ends",
        registerDate(cell(row, "Гарантія закінчується")),
      ),
      fillEmpty("repair_history", cell(row, "Repair History")),
      fillEmpty("description", cell(row, "Опис")),
      `attributes_json = CASE WHEN attributes_json IN ('', '[]') THEN ${text(JSON.stringify(attributes))} ELSE attributes_json END`,
    ];
    statements.push(
      `UPDATE inventory_items SET ${updates.join(",\n  ")},\n  updated_by_email = 'system:asset-register-import', updated_at = CURRENT_TIMESTAMP\nWHERE ${match};`,
    );
    if (holder)
      statements.push(`UPDATE inventory_items SET
  assigned_employee_id = ${employee},
  assignee_name = CASE WHEN ${employee} IS NULL THEN ${text(holder)} ELSE '' END,
  assigned_since = ${nullable(registerDate(cell(row, "Видано")))}
WHERE ${match} AND assigned_employee_id IS NULL AND assignee_name = '' AND assigned_since IS NULL;`);
    statements.push(
      `INSERT INTO inventory_catalog_events(entity_type, entity_id, action, details, actor_email, created_at)
SELECT 'item', id, 'updated', 'Asset register details imported', 'system:asset-register-import', CURRENT_TIMESTAMP
FROM inventory_items item WHERE ${match.replace("sku", "item.sku")}
  AND NOT EXISTS (SELECT 1 FROM inventory_catalog_events event
    WHERE event.entity_type = 'item' AND event.entity_id = item.id
      AND event.actor_email = 'system:asset-register-import');`,
    );
  }
  return { sql: statements.join("\n"), statements, rows };
}
