"use client";

import {
  type CSSProperties,
  useMemo,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  ArrowUpDown,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  Download,
  SlidersHorizontal,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { useDismissibleLayer } from "@/components/ui/useDismissibleLayer";
import { csvCell } from "@/lib/csv";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx";
import {
  actionsColumnWidth,
  buildExportRows,
  columnMinWidth,
  gridTemplateFor,
  sizingRowsFor,
  nextHeaderSort,
} from "./logic";
import { Pagination } from "./Pagination";
import { useDataTable } from "./useDataTable";
import type {
  DataTableColumn,
  DataTableProps,
  DataTableRowAction,
  DataTableSort,
  DataTableSortOption,
} from "./types";

const SKELETON_ROWS = 5;
const INTERACTIVE = "a, button, input, select, textarea, label, [role=button]";

function alignClass(align: DataTableColumn<unknown>["align"]) {
  return align === "center"
    ? " data-table-align-center"
    : align === "end"
      ? " data-table-align-end"
      : "";
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Shared table: CSS grid with table roles, one grid template for the header
 * and rows, sorting by header or menu, paging, selection, a pinned actions
 * column, CSV/XLSX export and sideways scrolling on narrow screens.
 */
export function DataTable<Row>(props: DataTableProps<Row>) {
  const {
    rowKey,
    columns,
    ariaLabel,
    sortMenu,
    pageSize = 20,
    density = "regular",
    minWidth,
    rowHref,
    onRowClick,
    rowClassName,
    rowActions,
    empty,
    loading = false,
    toolbar,
    selectable = false,
    exportFileName,
    className,
  } = props;
  const { t, locale } = useI18n();
  const router = useRouter();
  const table = useDataTable({ ...props, pageSize, locale });
  // Widths come from the widest rows of the whole list (or sizeRows), not
  // just the visible page, so paging, search and filters don't move them.
  const sizeSource = props.sizeRows ?? table.sortedRows;
  const sizers = useMemo(
    () => sizingRowsFor(sizeSource, table.visibleColumns),
    [sizeSource, table.visibleColumns],
  );
  const [confirming, setConfirming] = useState<DataTableRowAction | null>(null);

  const actionsFor = rowActions ?? (() => []);
  const maxActions = rowActions
    ? Math.max(1, ...table.pageRows.map((row) => rowActions(row).length))
    : 0;
  const actionsWidth = rowActions ? actionsColumnWidth(maxActions) : null;
  const gridTemplate = gridTemplateFor(table.visibleColumns, {
    selectable,
    actionsWidth,
  });
  const stickyColumn = table.visibleColumns[0]?.sticky
    ? table.visibleColumns[0].key
    : null;
  const style = (
    minWidth ? { "--data-table-min-width": `${minWidth}px` } : {}
  ) as CSSProperties;
  // Rows are subgrids of the table, so one template sizes every row and a
  // column can grow to fit its widest cell.
  const tableStyle = { gridTemplateColumns: gridTemplate };
  const clickable = Boolean(rowHref || onRowClick);

  // A shadow on the pinned columns while content scrolls beneath them.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => {
      const maxScroll = element.scrollWidth - element.clientWidth;
      setOverflow({
        start: element.scrollLeft > 1,
        end: element.scrollLeft < maxScroll - 1,
      });
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
    // The container keeps its size when columns change, but its content
    // width does not: recalculate whenever the grid template changes.
  }, [gridTemplate]);

  function activateRow(row: Row) {
    if (onRowClick) onRowClick(row);
    const href = rowHref?.(row);
    if (href) router.push(href);
  }
  function rowClick(event: MouseEvent<HTMLDivElement>, row: Row) {
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    activateRow(row);
  }
  function rowKeyDown(event: KeyboardEvent<HTMLDivElement>, row: Row) {
    if (event.target !== event.currentTarget || event.key !== "Enter") return;
    event.preventDefault();
    activateRow(row);
  }

  function runAction(action: DataTableRowAction) {
    if (action.danger) setConfirming(action);
    else action.onClick?.();
  }

  function exportRows() {
    return buildExportRows(table.sortedRows, table.visibleColumns, t);
  }
  function exportCsv() {
    const csv = exportRows()
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    download(
      new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }),
      `${exportFileName}.csv`,
    );
  }
  function exportXlsx() {
    download(
      new Blob([buildXlsx(exportRows(), ariaLabel)], { type: XLSX_MIME }),
      `${exportFileName}.xlsx`,
    );
  }

  const hideableColumns = columns.filter((column) => column.hideable);
  const viewSettings =
    sortMenu || hideableColumns.length > 0 ? (
      <ViewSettingsMenu
        sort={table.sort}
        sortOptions={sortMenu ? table.sortOptions : []}
        onSortChange={table.setSort}
        columns={hideableColumns}
        hiddenKeys={table.hiddenKeys}
        onToggleColumn={table.toggleColumn}
      />
    ) : null;
  const exportMenu = exportFileName ? (
    <ExportMenu onCsv={exportCsv} onXlsx={exportXlsx} />
  ) : null;

  const stickyClass = (key: string) =>
    key === stickyColumn ? " data-table-sticky" : "";

  return (
    <div
      className={`data-table-panel data-table-${density}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {typeof toolbar === "function"
        ? toolbar({ viewSettings, exportMenu })
        : toolbar}
      <div
        ref={scrollRef}
        className={`data-table-scroll${overflow.start ? " data-table-overflow-start" : ""}${overflow.end ? " data-table-overflow-end" : ""}`}
      >
        <div
          className="data-table"
          role="table"
          aria-label={ariaLabel}
          aria-rowcount={table.totalRows + 1}
          aria-busy={loading || undefined}
          style={tableStyle}
        >
          <div className="data-table-head" role="row">
            {selectable && (
              <span
                className={`data-table-select${stickyColumn ? " data-table-sticky" : ""}`}
                role="columnheader"
              >
                <input
                  type="checkbox"
                  aria-label={t("Select all")}
                  checked={table.allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = table.someSelected;
                  }}
                  onChange={table.toggleAll}
                />
              </span>
            )}
            {table.visibleColumns.map((column) => {
              const active = table.sort?.key === column.key;
              const direction = active ? table.sort?.direction : undefined;
              return (
                <span
                  key={column.key}
                  role="columnheader"
                  className={`${alignClass(column.align)}${stickyClass(column.key)}${column.truncate ? " data-table-truncate" : ""}`.trim()}
                  style={{ minWidth: columnMinWidth(column) }}
                  aria-sort={
                    column.sortValue
                      ? direction === "asc"
                        ? "ascending"
                        : direction === "desc"
                          ? "descending"
                          : "none"
                      : undefined
                  }
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      className={`data-table-sort${active ? " active" : ""}`}
                      onClick={() =>
                        table.setSort(nextHeaderSort(table.sort, column.key))
                      }
                    >
                      {t(column.header)}
                      {direction === "asc" ? (
                        <ArrowUp size={13} aria-hidden />
                      ) : direction === "desc" ? (
                        <ArrowDown size={13} aria-hidden />
                      ) : (
                        <ArrowUpDown size={13} aria-hidden />
                      )}
                    </button>
                  ) : (
                    t(column.header)
                  )}
                </span>
              );
            })}
            {rowActions && (
              <span
                className="data-table-actions data-table-align-end"
                role="columnheader"
              >
                <span className="sr-only">{t("Actions")}</span>
              </span>
            )}
          </div>
          {sizers.map((row) => (
            <div
              key={`sizer-${rowKey(row)}`}
              className="data-table-row data-table-sizer"
              aria-hidden
              inert
            >
              {/* Defensive: a disabled fieldset disables every control a
                  cell renders, now or after a later re-render, so copies of
                  inputs can never be submitted or focused. (Cells that read
                  their values from state, like the inventory count, would
                  not be affected anyway.) display: contents keeps the cells
                  in the row's grid. */}
              <fieldset className="data-table-sizer-cells" disabled>
                {selectable && <span />}
                {table.visibleColumns.map((column) => (
                  <span
                    key={column.key}
                    className={
                      column.truncate ? "data-table-truncate" : undefined
                    }
                  >
                    {column.cell(row)}
                  </span>
                ))}
                {rowActions && <span />}
              </fieldset>
            </div>
          ))}

          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="data-table-row data-table-skeleton-row"
                  role="row"
                  aria-hidden
                >
                  {selectable && <span role="cell" />}
                  {table.visibleColumns.map((column) => (
                    <span key={column.key} role="cell">
                      <span className="data-table-skeleton" />
                    </span>
                  ))}
                  {rowActions && <span role="cell" />}
                </div>
              ))
            : table.pageRows.map((row) => {
                const key = rowKey(row);
                const selected = selectable && table.isSelected(key);
                const extra = rowClassName?.(row);
                return (
                  <div
                    key={key}
                    className={`data-table-row${clickable ? " data-table-row-link" : ""}${selected ? " selected" : ""}${extra ? ` ${extra}` : ""}`}
                    role="row"
                    tabIndex={clickable ? 0 : undefined}
                    onClick={
                      clickable ? (event) => rowClick(event, row) : undefined
                    }
                    onKeyDown={
                      clickable ? (event) => rowKeyDown(event, row) : undefined
                    }
                  >
                    {selectable && (
                      <span
                        className={`data-table-select${stickyColumn ? " data-table-sticky" : ""}`}
                        role="cell"
                      >
                        <input
                          type="checkbox"
                          aria-label={t("Select row")}
                          checked={selected}
                          onChange={() => table.toggleRow(key)}
                        />
                      </span>
                    )}
                    {table.visibleColumns.map((column) => (
                      <span
                        key={column.key}
                        role="cell"
                        className={
                          `${alignClass(column.align)}${stickyClass(column.key)}${column.truncate ? " data-table-truncate" : ""}`.trim() ||
                          undefined
                        }
                      >
                        {column.cell(row)}
                      </span>
                    ))}
                    {rowActions && (
                      <span className="data-table-actions" role="cell">
                        {actionsFor(row).map((action, index) => {
                          const Icon = action.icon;
                          if (action.href)
                            return (
                              <a
                                key={`${index}-${action.label}`}
                                className="data-table-action"
                                href={action.href}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={action.label}
                                title={action.label}
                              >
                                <Icon size={16} />
                              </a>
                            );
                          return (
                            <button
                              type="button"
                              key={`${index}-${action.label}`}
                              className={`data-table-action${action.danger ? " danger" : ""}`}
                              disabled={action.disabled}
                              aria-label={action.label}
                              title={action.label}
                              onClick={() => runAction(action)}
                            >
                              <Icon size={16} />
                            </button>
                          );
                        })}
                      </span>
                    )}
                  </div>
                );
              })}
        </div>
      </div>
      {!loading && table.totalRows === 0 && empty && (
        <div className="compact-empty data-table-empty">
          {empty.icon && <empty.icon size={18} />}
          {empty.text}
        </div>
      )}
      {pageSize !== false && (
        <Pagination
          page={table.page}
          pageCount={table.pageCount}
          pageSize={pageSize}
          totalRows={table.totalRows}
          onPageChange={table.setPage}
        />
      )}
      {confirming && (
        <ConfirmActionDialog
          action={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            confirming.onClick?.();
          }}
        />
      )}
    </div>
  );
}

/** Same confirmation layout as the app's discard-changes dialog. */
function ConfirmActionDialog({
  action,
  onCancel,
  onConfirm,
}: {
  action: DataTableRowAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <DialogBackdrop
      className="dialog-confirm-layer"
      onClose={onCancel}
      confirmWhenDirty={false}
    >
      <section
        className="dialog-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="data-table-confirm-title"
      >
        <span>
          <AlertTriangle size={21} />
        </span>
        <h3 id="data-table-confirm-title">{action.label}?</h3>
        <p>{action.confirmText ?? t("This action cannot be undone.")}</p>
        <div>
          <button
            className="button ghost-button"
            type="button"
            data-dialog-initial-focus
            onClick={onCancel}
          >
            {t("Cancel")}
          </button>
          <button
            className="button danger-button"
            type="button"
            onClick={onConfirm}
          >
            {action.label}
          </button>
        </div>
      </section>
    </DialogBackdrop>
  );
}

function ViewSettingsMenu<Row>({
  sort,
  sortOptions,
  onSortChange,
  columns,
  hiddenKeys,
  onToggleColumn,
}: {
  sort: DataTableSort | null;
  sortOptions: DataTableSortOption<Row>[];
  onSortChange: (sort: DataTableSort) => void;
  columns: DataTableColumn<Row>[];
  hiddenKeys: string[];
  onToggleColumn: (key: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  useDismissibleLayer(open, anchorRef, () => {
    setOpen(false);
    setListOpen(false);
  });
  const direction = sort?.direction ?? "asc";
  const current = sortOptions.find((option) => option.key === sort?.key);

  return (
    <div className="dropdown-anchor" ref={anchorRef}>
      <button
        type="button"
        className="button ghost-button"
        aria-label={t("View settings")}
        title={t("View settings")}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setListOpen(false);
        }}
      >
        <SlidersHorizontal size={16} />
        <span className="data-table-toolbar-label">{t("View settings")}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <section
          className="dropdown-panel data-table-view-menu"
          aria-label={t("View settings")}
        >
          {sortOptions.length > 0 && (
            <div className="data-table-sort-row">
              <ArrowUpDown size={16} />
              <span>{t("Sort by")}</span>
              <div className="data-table-sort-direction" role="group">
                {(
                  [
                    ["asc", "Ascending", ArrowUpNarrowWide],
                    ["desc", "Descending", ArrowDownWideNarrow],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    type="button"
                    key={value}
                    className={direction === value ? "active" : ""}
                    aria-pressed={direction === value}
                    aria-label={t(label)}
                    title={t(label)}
                    onClick={() =>
                      onSortChange({
                        key: sort?.key ?? sortOptions[0].key,
                        direction: value,
                      })
                    }
                  >
                    <Icon size={15} />
                  </button>
                ))}
              </div>
              <div className="data-table-sort-field">
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={listOpen}
                  onClick={() => setListOpen((value) => !value)}
                >
                  {current ? t(current.label) : t("Sort by")}
                  <ChevronDown size={15} />
                </button>
                {listOpen && (
                  <ul className="data-table-sort-list" role="listbox">
                    {sortOptions.map((option) => (
                      <li key={option.key}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={sort?.key === option.key}
                          className={sort?.key === option.key ? "active" : ""}
                          onClick={() => {
                            onSortChange({ key: option.key, direction });
                            setListOpen(false);
                          }}
                        >
                          {t(option.label)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {columns.length > 0 && (
            <div className="data-table-column-list" role="group">
              <strong>{t("Columns")}</strong>
              {columns.map((column) => {
                const shown = !hiddenKeys.includes(column.key);
                return (
                  <button
                    type="button"
                    key={column.key}
                    aria-pressed={shown}
                    onClick={() => onToggleColumn(column.key)}
                  >
                    <span className="data-table-check">
                      {shown && <Check size={13} />}
                    </span>
                    {t(column.header)}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ExportMenu({
  onCsv,
  onXlsx,
}: {
  onCsv: () => void;
  onXlsx: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  useDismissibleLayer(open, anchorRef, () => setOpen(false));
  return (
    <div className="dropdown-anchor" ref={anchorRef}>
      <button
        type="button"
        className="button ghost-button"
        aria-label={t("Export to")}
        title={t("Export to")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Download size={16} />
        <span className="data-table-toolbar-label">{t("Export to")}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <section
          className="dropdown-panel data-table-export-menu"
          aria-label={t("Export to")}
        >
          <button
            type="button"
            onClick={() => {
              onXlsx();
              setOpen(false);
            }}
          >
            Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => {
              onCsv();
              setOpen(false);
            }}
          >
            CSV
          </button>
        </section>
      )}
    </div>
  );
}
