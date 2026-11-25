// Builds upsert SQL for an asset register export. Used by
// scripts/import-assets-xlsx.mjs; kept free of file I/O so it can be tested.
//
// Ownership rules for re-imports:
// - New codes are inserted with status and holder taken from the register.
// - For codes that already exist, only descriptive fields are refreshed. Status
//   and holder are managed in the app after the first import (repair, returns,
//   reassignments) and are never overwritten by the register.
// - The one exception is a write-off: a register row in the "Списано" category
//   retires the asset and clears its holder, because a write-off is final.

export const WRITTEN_OFF_CATEGORY = "Списано";

export const categoryKeys = {
  Ноутбук: "laptop",
  Монітор: "monitor",
  Телефон: "phone",
  Зарядні: "charger",
  Шнури: "cables",
  Інше: "other",
  Кавомашина: "coffee_machine",
  "Мікрохвильова піч": "microwave",
  Порохотяг: "vacuum",
  [WRITTEN_OFF_CATEGORY]: "written_off",
};

const attributeColumns = {
  Модель: "Model",
  Рік: "Year",
  Діагональ: "Screen size",
  Процесор: "Processor",
  "Пам`ять": "Memory",
  SSD: "SSD",
};

// Cyrillic letters that look like Latin ones. Serial numbers are Latin, but a
// register typed on a Ukrainian layout can contain e.g. a Cyrillic "С", which
// breaks search and sorting.
const latinLookalikes = {
  А: "A",
  В: "B",
  С: "C",
  Е: "E",
  Н: "H",
  І: "I",
  К: "K",
  М: "M",
  О: "O",
  Р: "P",
  Т: "T",
  Х: "X",
  а: "a",
  с: "c",
  е: "e",
  і: "i",
  о: "o",
  р: "p",
  х: "x",
};

export function normalizeSerialNumber(value) {
  return value.replace(
    /[АВСЕНІКМОРТХасеіорх]/g,
    (char) => latinLookalikes[char],
  );
}

/** Excel stores dates as days since 1899-12-30. */
export function excelDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const days = Number(value);
  if (!Number.isFinite(days)) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const nullable = (value) =>
  value === null || value === undefined || value === ""
    ? "NULL"
    : `'${String(value).replaceAll("'", "''")}'`;
const text = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;

/**
 * @param {string[]} header first sheet row
 * @param {string[][]} body remaining rows
 * @param {Set<string>} wanted register categories to import
 */
export function buildAssetImportSql(header, body, wanted) {
  const column = Object.fromEntries(header.map((name, index) => [name, index]));
  for (const required of ["Код", "Назва", "Категорія"])
    if (!(required in column)) throw new Error(`Missing column: ${required}`);
  const cell = (row, name) =>
    name in column ? String(row[column[name]] ?? "").trim() : "";

  const statements = [];
  const counts = {};
  for (const row of body) {
    const sourceCategory = cell(row, "Категорія");
    const tag = cell(row, "Код").toUpperCase();
    if (!wanted.has(sourceCategory) || !tag) continue;
    counts[sourceCategory] = (counts[sourceCategory] ?? 0) + 1;
    const retired = sourceCategory === WRITTEN_OFF_CATEGORY;
    const holder = retired ? "" : cell(row, "Призначено");
    const attributes = Object.entries(attributeColumns)
      .map(([source, label]) => ({ label, value: cell(row, source) }))
      .filter((item) => item.value);
    const employee = holder
      ? `(SELECT id FROM employees WHERE lower(trim(first_name) || ' ' || trim(last_name)) = lower(${text(holder)}) ORDER BY id LIMIT 1)`
      : "NULL";
    const status = retired ? "retired" : holder ? "assigned" : "available";
    const retireOnConflict = retired
      ? `,
  status = 'retired', assigned_employee_id = NULL, assignee_name = '',
  assigned_since = NULL`
      : "";
    statements.push(`INSERT INTO company_assets
  (name, asset_tag, category, status, assigned_employee_id, serial_number,
   price, location, division, department, warranty_ends, description,
   repair_history, attributes_json, assigned_since, assignee_name, updated_at)
VALUES
  (${text(cell(row, "Назва"))}, ${text(tag)},
   ${text(categoryKeys[sourceCategory] ?? "other")}, ${text(status)},
   ${employee}, ${text(normalizeSerialNumber(cell(row, "Серійний номер")))}, ${text(cell(row, "Ціна"))},
   ${text(cell(row, "Локація"))}, ${text(cell(row, "Підрозділ"))},
   ${text(cell(row, "Департамент"))},
   ${nullable(excelDate(cell(row, "Гарантія закінчується")))},
   ${text(cell(row, "Опис"))}, ${text(cell(row, "Repair History"))},
   ${text(JSON.stringify(attributes))},
   ${nullable(holder ? excelDate(cell(row, "Видано")) : null)},
   ${text(holder)}, CURRENT_TIMESTAMP)
ON CONFLICT(asset_tag) DO UPDATE SET
  name = excluded.name, category = excluded.category,
  serial_number = excluded.serial_number, price = excluded.price,
  location = excluded.location, division = excluded.division,
  department = excluded.department, warranty_ends = excluded.warranty_ends,
  description = excluded.description, repair_history = excluded.repair_history,
  attributes_json = excluded.attributes_json${retireOnConflict},
  updated_at = CURRENT_TIMESTAMP;`);
  }
  // A matched employee becomes the source of truth for the holder's name.
  if (statements.length)
    statements.push(
      "UPDATE company_assets SET assignee_name = '' WHERE assigned_employee_id IS NOT NULL AND assignee_name <> '';",
    );
  return { sql: statements.join("\n"), counts };
}
