/**
 * DataTable logic as pure functions, so it can be tested without a DOM.
 * Keep runtime imports out of this file: tests load it directly in Node.
 */
import type {
  DataTableColumn,
  DataTableRowKey,
  DataTableSort,
  DataTableSortOption,
  DataTableSortValue,
  SortDirection,
} from "./types";

export const DEFAULT_COLUMN_MIN_WIDTH = 130;
export const SELECT_COLUMN_WIDTH = "44px";
const ACTION_BUTTON_WIDTH = 32;
const ACTION_GAP = 6;
/** Left padding of the actions cell; the right one is the table inset. */
const ACTIONS_PADDING_START = 10;

export function isEmptySortValue(value: DataTableSortValue) {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "number" && Number.isNaN(value))
  );
}

/**
 * Compares two sort values in the given direction. Numbers compare
 * numerically, text with the locale's collation (numbers inside text in
 * natural order, case and accents ignored). Empty values always go last,
 * whatever the direction.
 */
export function compareSortValues(
  left: DataTableSortValue,
  right: DataTableSortValue,
  direction: SortDirection,
  locale?: string,
) {
  const leftEmpty = isEmptySortValue(left);
  const rightEmpty = isEmptySortValue(right);
  if (leftEmpty || rightEmpty)
    return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
  const sign = direction === "asc" ? 1 : -1;
  if (typeof left === "number" && typeof right === "number")
    return sign * (left - right);
  return (
    sign *
    String(left).localeCompare(String(right), locale, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

/** Stable sort of a copy of rows; returns rows unchanged without a value. */
export function sortRows<Row>(
  rows: readonly Row[],
  sortValue: ((row: Row) => DataTableSortValue) | undefined,
  direction: SortDirection,
  locale?: string,
) {
  if (!sortValue) return [...rows];
  const values = new Map(rows.map((row) => [row, sortValue(row)]));
  return [...rows].sort((a, b) =>
    compareSortValues(values.get(a), values.get(b), direction, locale),
  );
}

/** Sort menu entries: the given list, or every sortable column. */
export function sortOptionsFor<Row>(
  columns: readonly DataTableColumn<Row>[],
  sortMenu: boolean | readonly DataTableSortOption<Row>[] | undefined,
): DataTableSortOption<Row>[] {
  if (Array.isArray(sortMenu)) {
    // An option without its own value needs a sortable column of that key,
    // or choosing it would show it as active without sorting anything.
    const sortable = new Set(
      columns.filter((column) => column.sortValue).map((column) => column.key),
    );
    return sortMenu.filter(
      (option) => option.sortValue || sortable.has(option.key),
    );
  }
  return columns
    .filter((column) => column.sortValue)
    .map((column) => ({ key: column.key, label: column.header }));
}

/** The value a sort key sorts by: a sort option's own, else its column's. */
export function resolveSortValue<Row>(
  key: string | undefined,
  columns: readonly DataTableColumn<Row>[],
  options: readonly DataTableSortOption<Row>[] = [],
) {
  if (!key) return undefined;
  return (
    options.find((option) => option.key === key)?.sortValue ??
    columns.find((column) => column.key === key)?.sortValue
  );
}

/** Header click: the same column flips direction, another starts ascending. */
export function nextHeaderSort(
  current: DataTableSort | null | undefined,
  key: string,
): DataTableSort {
  if (current?.key === key)
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: "asc" };
}

export type DataTableState = { sort: DataTableSort | null; page: number };
export type DataTableAction =
  { type: "sort"; sort: DataTableSort } | { type: "page"; page: number };

/** Any sort change, from a header or the menu, returns to the first page. */
export function dataTableReducer(
  state: DataTableState,
  action: DataTableAction,
): DataTableState {
  if (action.type === "sort") return { sort: action.sort, page: 1 };
  return { ...state, page: Math.max(1, Math.floor(action.page)) };
}

export function pageCountFor(totalRows: number, pageSize: number | false) {
  if (pageSize === false || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(totalRows / pageSize));
}

export function clampPage(page: number, pageCount: number) {
  return Math.min(Math.max(1, Math.floor(page) || 1), Math.max(1, pageCount));
}

/** Rows shown on a page of an unpaged (client-side) list. */
export function pageSlice<Row>(
  rows: readonly Row[],
  page: number,
  pageSize: number | false,
) {
  if (pageSize === false) return [...rows];
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

/** 1-based first and last row number of a page; zeros when empty. */
export function pageRange(
  page: number,
  pageSize: number | false,
  totalRows: number,
) {
  if (totalRows === 0) return { from: 0, to: 0 };
  if (pageSize === false) return { from: 1, to: totalRows };
  return {
    from: (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, totalRows),
  };
}

/**
 * Page buttons with gaps: up to 7 pages all show; otherwise the first, the
 * last, the current with its neighbours, and the first or last five near
 * either end.
 */
export function pageList(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 4) [2, 3, 4, 5].forEach((page) => pages.add(page));
  if (current >= total - 3)
    [total - 4, total - 3, total - 2, total - 1].forEach((page) =>
      pages.add(page),
    );
  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  return sorted.flatMap((page, index) =>
    index > 0 && page - sorted[index - 1] > 1 ? ["gap" as const, page] : page,
  );
}

/** Columns hidden before the user changes anything. */
export function defaultHiddenKeys<Row>(
  columns: readonly DataTableColumn<Row>[],
) {
  return columns
    .filter((column) => column.hideable && column.defaultHidden)
    .map((column) => column.key);
}

/** Hidden keys saved in storage, limited to columns that can be hidden. */
export function parseHiddenKeys<Row>(
  stored: string | null,
  columns: readonly DataTableColumn<Row>[],
) {
  if (stored === null) return defaultHiddenKeys(columns);
  try {
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return defaultHiddenKeys(columns);
    const hideable = new Set(
      columns.filter((column) => column.hideable).map((column) => column.key),
    );
    return value.filter(
      (key): key is string => typeof key === "string" && hideable.has(key),
    );
  } catch {
    return defaultHiddenKeys(columns);
  }
}

export function visibleColumnsFor<Row>(
  columns: readonly DataTableColumn<Row>[],
  hiddenKeys: readonly string[],
) {
  const hidden = new Set(hiddenKeys);
  return columns.filter(
    (column) => !(column.hideable && hidden.has(column.key)),
  );
}

function exportCell(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function exportHeaders(column: {
  exportHeader?: string | string[];
  header: string;
}) {
  const header = column.exportHeader ?? column.header;
  return Array.isArray(header) ? header : [header];
}

/**
 * Export cells of one column: exportValue, else the cell when it renders
 * non-empty plain text or a number (so it reads as on screen), else the sort value.
 * Always as many cells as the column has export headers.
 */
function exportCells<Row>(column: DataTableColumn<Row>, row: Row) {
  let value: unknown;
  if (column.exportValue) value = column.exportValue(row);
  else {
    const cell = column.cell(row);
    value =
      (typeof cell === "string" && cell !== "") || typeof cell === "number"
        ? cell
        : column.sortValue?.(row);
  }
  const values = Array.isArray(value) ? value : [value];
  return exportHeaders(column).map((_, index) => exportCell(values[index]));
}

/**
 * Spreadsheet rows for the given (already filtered and sorted) rows and
 * visible columns; the first row is the header.
 */
export function buildExportRows<Row>(
  rows: readonly Row[],
  columns: readonly DataTableColumn<Row>[],
  t: (key: string) => string = (key) => key,
): string[][] {
  const headers = columns.flatMap((column) =>
    exportHeaders(column).map((key) => t(key)),
  );
  const body = rows.map((row) =>
    columns.flatMap((column) => exportCells(column, row)),
  );
  return [headers, ...body];
}

/** Width of the actions column for the most buttons any row shows. */
export function actionsColumnWidth(maxActions: number) {
  const count = Math.max(1, maxActions);
  const buttons =
    count * ACTION_BUTTON_WIDTH +
    (count - 1) * ACTION_GAP +
    ACTIONS_PADDING_START;
  return `calc(${buttons}px + var(--data-table-inset, 15px))`;
}

/**
 * Grid track of a column: as wide as its widest cell (max-content), plus
 * a share of the spare width when grow is set; the header cell enforces the
 * base width (columnMinWidth). A truncated column uses its base width (and
 * grow share) instead of its content.
 */
export function columnTrack<Row>(column: DataTableColumn<Row>) {
  if (column.width) return column.width;
  const grow = column.grow ?? 0;
  const base = `${column.minWidth ?? DEFAULT_COLUMN_MIN_WIDTH}px`;
  if (column.truncate) return grow > 0 ? `minmax(${base}, ${grow}fr)` : base;
  return grow > 0 ? `minmax(max-content, ${grow}fr)` : "max-content";
}

/**
 * Columns with the default sizing applied: when no column sets grow (or a
 * raw width), the first column takes all spare width and the others stay
 * as wide as their content.
 */
export function withDefaultGrow<Row>(
  columns: readonly DataTableColumn<Row>[],
): DataTableColumn<Row>[] {
  const anyGrows = columns.some(
    (column) => column.width || (column.grow ?? 0) > 0,
  );
  if (anyGrows || columns.length === 0) return [...columns];
  return [{ ...columns[0], grow: 1 }, ...columns.slice(1)];
}

/** Base width the header cell enforces; none for raw or truncated tracks. */
export function columnMinWidth<Row>(column: DataTableColumn<Row>) {
  if (column.width || column.truncate) return undefined;
  return `${column.minWidth ?? DEFAULT_COLUMN_MIN_WIDTH}px`;
}

/** One grid template shared by the header and every row. */
export function gridTemplateFor<Row>(
  columns: readonly DataTableColumn<Row>[],
  options: { selectable?: boolean; actionsWidth?: string | null } = {},
) {
  return [
    ...(options.selectable ? [SELECT_COLUMN_WIDTH] : []),
    ...withDefaultGrow(columns).map(columnTrack),
    ...(options.actionsWidth ? [options.actionsWidth] : []),
  ].join(" ");
}

/** Selection after the header checkbox: all page rows on, or all off. */
export function toggleAllSelection(
  selected: readonly DataTableRowKey[],
  pageKeys: readonly DataTableRowKey[],
) {
  const pageSet = new Set(pageKeys);
  const allSelected =
    pageKeys.length > 0 && pageKeys.every((key) => selected.includes(key));
  if (allSelected) return selected.filter((key) => !pageSet.has(key));
  return [...selected, ...pageKeys.filter((key) => !selected.includes(key))];
}

export function toggleRowSelection(
  selected: readonly DataTableRowKey[],
  key: DataTableRowKey,
) {
  return selected.includes(key)
    ? selected.filter((item) => item !== key)
    : [...selected, key];
}

/** Selected keys that still have a row; the rest were filtered away. */
export function pruneSelection(
  selected: readonly DataTableRowKey[],
  rowKeys: readonly DataTableRowKey[],
) {
  const present = new Set(rowKeys);
  return selected.filter((key) => present.has(key));
}

/** Rows per column that size it: the ones with the longest text. */
export const SIZING_ROWS_PER_COLUMN = 3;

/**
 * The few rows that decide column widths: for each column, the rows whose
 * text (as exported: exportValue, plain-text cell or sortValue) is longest.
 * Rendering only these, invisibly, keeps widths stable across pages, search
 * and filters without laying out every row.
 */
export function sizingRowsFor<Row>(
  rows: readonly Row[],
  columns: readonly DataTableColumn<Row>[],
  perColumn = SIZING_ROWS_PER_COLUMN,
): Row[] {
  const picked = new Set<Row>();
  for (const column of columns) {
    if (column.truncate || column.width) continue;
    const ranked = rows
      .map((row) => ({
        row,
        length: exportCells(column, row).join(" ").length,
      }))
      .sort((a, b) => b.length - a.length)
      .slice(0, perColumn);
    ranked.forEach(({ row }) => picked.add(row));
  }
  return rows.filter((row) => picked.has(row));
}
