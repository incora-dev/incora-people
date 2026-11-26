import type { ComponentType, ReactNode } from "react";

export type SortDirection = "asc" | "desc";
export type DataTableSort = { key: string; direction: SortDirection };
/** Empty values (null, undefined, "") always sort after the others. */
export type DataTableSortValue = string | number | null | undefined;
export type DataTableRowKey = string | number;
export type DataTableAlign = "start" | "center" | "end";
export type DataTableDensity = "regular" | "compact";

export type DataTableColumn<Row> = {
  key: string;
  /** Translation key; rendered through t(). */
  header: string;
  cell: (row: Row) => ReactNode;
  /**
   * Base width in px (default 130). The column grows past it when its
   * content is wider, unless truncate is set.
   */
  minWidth?: number;
  /**
   * Share of the spare width, like an fr unit. Default 0: the column is as
   * wide as its content (at least minWidth). When no column sets grow, the
   * first column takes all spare width.
   */
  grow?: number;
  /**
   * Keep the column at its base width share and let long content wrap or
   * ellipsize instead of widening the table (free text, descriptions).
   */
  truncate?: boolean;
  /** Raw grid track; overrides minWidth, grow and truncate. */
  width?: string;
  align?: DataTableAlign;
  /** Makes the column sortable by header click and in the sort menu. */
  sortValue?: (row: Row) => DataTableSortValue;
  /** The column can be switched off in View settings. */
  hideable?: boolean;
  /** Hidden until the user switches it on (needs hideable). */
  defaultHidden?: boolean;
  /**
   * Export cell(s). Return an array to export the column as several
   * spreadsheet columns; exportHeader then names each of them, and the
   * values are padded or cut to that many. Defaults to the cell when it
   * renders non-empty plain text or a number, else to sortValue.
   */
  exportValue?: (row: Row) => string | number | null | undefined | string[];
  /** Translation key(s) of the export header; defaults to header. */
  exportHeader?: string | string[];
  /** Keeps the column in view while scrolling sideways (first column). */
  sticky?: boolean;
};

/**
 * A sort menu entry. Without sortValue it refers to the column with the
 * same key; with sortValue it sorts by a value that has no column.
 */
export type DataTableSortOption<Row> = {
  key: string;
  /** Translation key. */
  label: string;
  sortValue?: (row: Row) => DataTableSortValue;
};

export type DataTableRowAction = {
  icon: ComponentType<{ size?: number }>;
  /** Translated text for aria-label and title. */
  label: string;
  onClick?: () => void;
  /** Renders a link that opens in a new tab instead of a button. */
  href?: string;
  /** Shown in red; asks for confirmation before onClick runs. */
  danger?: boolean;
  /** Translated confirmation text for a danger action. */
  confirmText?: string;
};

/** Controls DataTable renders for the toolbar slot to place. */
export type DataTableToolbarControls = {
  /** "View settings" menu: sort and column visibility. */
  viewSettings: ReactNode;
  /** "Export to" menu, when exportFileName is set. */
  exportMenu: ReactNode;
};

export type DataTableProps<Row> = {
  rows: Row[];
  rowKey: (row: Row) => DataTableRowKey;
  columns: DataTableColumn<Row>[];
  /** Translated label of the table; also the export sheet name. */
  ariaLabel: string;
  defaultSort?: DataTableSort | null;
  /**
   * Shows the "View settings" sort menu. true lists the sortable columns;
   * an array lists exactly these options, in order.
   */
  sortMenu?: boolean | DataTableSortOption<Row>[];
  /** Rows per page; false shows every row. Defaults to 20. */
  pageSize?: number | false;
  density?: DataTableDensity;
  /** Minimum table width; narrower screens scroll sideways. */
  minWidth?: number;
  rowHref?: (row: Row) => string | null | undefined;
  onRowClick?: (row: Row) => void;
  rowClassName?: (row: Row) => string | undefined;
  /** Icon buttons in a fixed column on the right, kept in view. */
  rowActions?: (row: Row) => DataTableRowAction[];
  empty?: { icon?: ComponentType<{ size?: number }>; text: string };
  loading?: boolean;
  /** Toolbar above the table; a function receives the built-in menus. */
  toolbar?: ReactNode | ((controls: DataTableToolbarControls) => ReactNode);
  selectable?: boolean;
  selectedKeys?: DataTableRowKey[];
  onSelectionChange?: (keys: DataTableRowKey[]) => void;
  /** Remembers hidden columns in localStorage under this key. */
  storageKey?: string;
  /** Enables CSV/XLSX export as `${exportFileName}.csv|.xlsx`. */
  exportFileName?: string;
  /** Controlled sort. */
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
  /** Controlled page (1-based). */
  page?: number;
  onPageChange?: (page: number) => void;
  /**
   * Server-side mode: rows are already sorted and paged, and this is the
   * total across all pages.
   */
  totalRows?: number;
  className?: string;
};
