"use client";

import { useCallback, useMemo, useReducer, useState, useEffect } from "react";
import {
  clampPage,
  dataTableReducer,
  defaultHiddenKeys,
  pageCountFor,
  pageSlice,
  parseHiddenKeys,
  resolveSortValue,
  sortOptionsFor,
  sortRows,
  toggleAllSelection,
  toggleRowSelection,
  visibleColumnsFor,
} from "./logic";
import type {
  DataTableColumn,
  DataTableProps,
  DataTableRowKey,
  DataTableSort,
} from "./types";

type Options<Row> = Pick<
  DataTableProps<Row>,
  | "rows"
  | "rowKey"
  | "columns"
  | "defaultSort"
  | "sortMenu"
  | "pageSize"
  | "selectedKeys"
  | "onSelectionChange"
  | "storageKey"
  | "sort"
  | "onSortChange"
  | "page"
  | "onPageChange"
  | "totalRows"
> & { locale?: string };

function storageName(key: string) {
  return `data-table:${key}:hidden-columns`;
}

/**
 * Sorting, paging, selection and column visibility for DataTable. Header
 * clicks and the sort menu share one sort state; changing it returns to
 * page 1. Each piece is controlled when its value prop is passed.
 */
export function useDataTable<Row>({
  rows,
  rowKey,
  columns,
  defaultSort = null,
  sortMenu,
  pageSize = 20,
  selectedKeys,
  onSelectionChange,
  storageKey,
  sort: controlledSort,
  onSortChange,
  page: controlledPage,
  onPageChange,
  totalRows,
  locale,
}: Options<Row>) {
  const [state, dispatch] = useReducer(dataTableReducer, {
    sort: defaultSort,
    page: 1,
  });
  const sort = controlledSort !== undefined ? controlledSort : state.sort;
  const requestedPage = controlledPage ?? state.page;
  const serverSide = totalRows !== undefined;

  const setSort = useCallback(
    (next: DataTableSort) => {
      dispatch({ type: "sort", sort: next });
      onSortChange?.(next);
      if (controlledPage !== undefined) onPageChange?.(1);
    },
    [controlledPage, onPageChange, onSortChange],
  );
  const setPage = useCallback(
    (next: number) => {
      dispatch({ type: "page", page: next });
      onPageChange?.(next);
    },
    [onPageChange],
  );

  const sortOptions = useMemo(
    () => sortOptionsFor(columns, sortMenu),
    [columns, sortMenu],
  );
  const sortedRows = useMemo(() => {
    if (serverSide) return rows;
    const sortValue = resolveSortValue(sort?.key, columns, sortOptions);
    return sortRows(rows, sortValue, sort?.direction ?? "asc", locale);
  }, [rows, serverSide, sort, columns, sortOptions, locale]);

  const total = totalRows ?? sortedRows.length;
  const pageCount = pageCountFor(total, pageSize);
  const page = clampPage(requestedPage, pageCount);
  const pageRows = serverSide
    ? sortedRows
    : pageSlice(sortedRows, page, pageSize);

  // Hidden columns: defaults on the server and first render, then storage.
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(() =>
    defaultHiddenKeys(columns),
  );
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = window.localStorage.getItem(storageName(storageKey));
      // Reading storage after hydration keeps the server markup stable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHiddenKeys(parseHiddenKeys(stored, columns));
    } catch {
      // Storage can be unavailable (private mode); keep the defaults.
    }
    // Columns are read once per storage key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const toggleColumn = useCallback(
    (key: string) => {
      setHiddenKeys((current) => {
        const next = current.includes(key)
          ? current.filter((item) => item !== key)
          : [...current, key];
        if (storageKey) {
          try {
            window.localStorage.setItem(
              storageName(storageKey),
              JSON.stringify(next),
            );
          } catch {
            // Not persisted; the choice still applies to this page view.
          }
        }
        return next;
      });
    },
    [storageKey],
  );
  const visibleColumns: DataTableColumn<Row>[] = useMemo(
    () => visibleColumnsFor(columns, hiddenKeys),
    [columns, hiddenKeys],
  );

  const [ownSelection, setOwnSelection] = useState<DataTableRowKey[]>([]);
  const selection = selectedKeys ?? ownSelection;
  const setSelection = useCallback(
    (next: DataTableRowKey[]) => {
      setOwnSelection(next);
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );
  const pageKeys = pageRows.map(rowKey);
  const selectedOnPage = pageKeys.filter((key) => selection.includes(key));

  return {
    sort,
    setSort,
    sortOptions,
    page,
    setPage,
    pageCount,
    totalRows: total,
    sortedRows,
    pageRows,
    hiddenKeys,
    toggleColumn,
    visibleColumns,
    selection,
    isSelected: (key: DataTableRowKey) => selection.includes(key),
    toggleRow: (key: DataTableRowKey) =>
      setSelection(toggleRowSelection(selection, key)),
    toggleAll: () => setSelection(toggleAllSelection(selection, pageKeys)),
    allSelected:
      pageKeys.length > 0 && selectedOnPage.length === pageKeys.length,
    someSelected:
      selectedOnPage.length > 0 && selectedOnPage.length < pageKeys.length,
  };
}
