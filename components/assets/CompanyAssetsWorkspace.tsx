"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  Search,
  SlidersHorizontal,
  Wrench,
  X,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { useDismissibleLayer } from "@/components/ui/useDismissibleLayer";
import { AssetDetailsDialog } from "@/components/assets/AssetDetailsDialog";
import {
  AssetActiveFilters,
  AssetFilterMenu,
} from "@/components/assets/AssetFilterMenu";
import { csvCell } from "@/lib/csv";
import {
  countAssetFilters,
  emptyAssetFilters,
  matchesAssetFilters,
  type AssetFilterOptions,
  type AssetFilters,
} from "@/modules/assets/filter-options";
import type { AssetRegisterItem } from "@/modules/assets/register";

type Asset = AssetRegisterItem;
type Scope = "company" | "mine";
type Lifecycle = "active" | "archived";
type Column = "serialNumber" | "category" | "assignee";

// Categories of the inventory groups shown on this page.
const categories = ["laptop", "monitor", "written_off"];
const columns: { key: Column; label: string }[] = [
  { key: "serialNumber", label: "Serial number" },
  { key: "category", label: "Category" },
  { key: "assignee", label: "Assigned to" },
];
type SortKey = "code" | "name" | "serialNumber" | "category" | "assignee";
const sortOptions: { key: SortKey; label: string }[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "serialNumber", label: "Serial number" },
  { key: "category", label: "Category" },
  { key: "assignee", label: "Assigned to" },
];
const PAGE_SIZE = 20;

function pageList(current: number, total: number): (number | "gap")[] {
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

export function CompanyAssetsWorkspace({
  assets,
  currentEmployeeId,
  filterOptions,
}: {
  assets: Asset[];
  currentEmployeeId: number | null;
  filterOptions: AssetFilterOptions;
}) {
  const { t } = useI18n();
  const [scope, setScope] = useState<Scope>("company");
  const [lifecycle, setLifecycle] = useState<Lifecycle>("active");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AssetFilters>(emptyAssetFilters);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [sortListOpen, setSortListOpen] = useState(false);
  const [viewing, setViewing] = useState<Asset | null>(null);
  const [page, setPage] = useState(1);
  const [openMenu, setOpenMenu] = useState<
    "filters" | "view" | "export" | null
  >(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useDismissibleLayer(openMenu !== null, toolbarRef, () => {
    setOpenMenu(null);
    setSortListOpen(false);
  });

  const scoped = useMemo(
    () =>
      scope === "mine"
        ? assets.filter(
            (asset) =>
              currentEmployeeId !== null &&
              asset.assignee?.id === currentEmployeeId,
          )
        : assets,
    [assets, scope, currentEmployeeId],
  );
  const activeCount = scoped.filter(
    (asset) => asset.status !== "retired",
  ).length;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = scoped.filter((asset) => {
      if ((asset.status === "retired") !== (lifecycle === "archived"))
        return false;
      if (!matchesAssetFilters(asset, filters)) return false;
      if (!needle) return true;
      return [
        asset.name,
        asset.assetTag,
        asset.serialNumber,
        asset.assignee?.firstName,
        asset.assignee?.lastName,
      ].some((value) => value?.toLowerCase().includes(needle));
    });
    const sortValue = (asset: Asset) =>
      sortKey === "code"
        ? asset.assetTag
        : sortKey === "name"
          ? asset.name
          : sortKey === "serialNumber"
            ? asset.serialNumber
            : sortKey === "category"
              ? t(asset.category)
              : asset.assignee
                ? `${asset.assignee.firstName} ${asset.assignee.lastName}`
                : "";
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...matching].sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);
      // Empty values (no serial number, nobody assigned) always go last.
      if (!left || !right) return left ? -1 : right ? 1 : 0;
      return (
        direction *
        left.localeCompare(right, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
    });
  }, [scoped, lifecycle, filters, query, sortKey, sortDirection, t]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visible.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const activeFilters = countAssetFilters(filters);
  const gridTemplate = [
    "minmax(280px, 1.4fr)",
    ...columns.map((column) =>
      column.key === "assignee" ? "minmax(200px, 1.6fr)" : "minmax(130px, 1fr)",
    ),
  ].join(" ");

  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  function exportCsv() {
    const header = ["Name", "Asset tag", ...columns.map((c) => c.label)];
    const rows = visible.map((asset) => [
      asset.name,
      asset.assetTag,
      ...columns.map((column) =>
        column.key === "serialNumber"
          ? asset.serialNumber
          : column.key === "category"
            ? t(asset.category)
            : asset.assignee
              ? `${asset.assignee.firstName} ${asset.assignee.lastName}`
              : asset.status === "repair"
                ? t("In repair")
                : "",
      ),
    ]);
    const csv = [header.map((h) => t(h)), ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "assets.csv";
    link.click();
    URL.revokeObjectURL(url);
    setOpenMenu(null);
  }

  return (
    <>
      <section className="asset-page-heading">
        <h1>{t("Assets")}</h1>
        <div className="asset-scope-switch" role="group">
          {(
            [
              ["company", "Company"],
              ["mine", "Mine"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={scope === value ? "active" : ""}
              aria-pressed={scope === value}
              onClick={() => resetPage(setScope)(value)}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </section>

      <section className="panel directory-panel asset-panel">
        <div className="asset-toolbar" ref={toolbarRef}>
          <div
            className="directory-quick-status"
            role="group"
            aria-label={t("Asset filters")}
          >
            <button
              type="button"
              className={
                lifecycle === "active" ? "directory-status-active" : ""
              }
              aria-pressed={lifecycle === "active"}
              onClick={() => resetPage(setLifecycle)("active")}
            >
              {t("Active assets")} <span>{activeCount}</span>
            </button>
            <button
              type="button"
              className={
                lifecycle === "archived" ? "directory-status-active" : ""
              }
              aria-pressed={lifecycle === "archived"}
              onClick={() => resetPage(setLifecycle)("archived")}
            >
              {t("Archived assets")}
            </button>
          </div>

          <div className="dropdown-anchor">
            {activeFilters > 0 ? (
              <div className="asset-filter-trigger">
                <button
                  type="button"
                  aria-expanded={openMenu === "filters"}
                  onClick={() =>
                    setOpenMenu((open) =>
                      open === "filters" ? null : "filters",
                    )
                  }
                >
                  <Filter size={16} /> {t("Filters")}
                </button>
                <button
                  type="button"
                  className="asset-filter-trigger-clear"
                  aria-label={t("Reset filters")}
                  onClick={() => resetPage(setFilters)(emptyAssetFilters)}
                >
                  <span className="filter-count">{activeFilters}</span>
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="button ghost-button asset-filter-button"
                aria-expanded={openMenu === "filters"}
                onClick={() =>
                  setOpenMenu((open) => (open === "filters" ? null : "filters"))
                }
              >
                <Filter size={16} /> {t("Add filter")}
              </button>
            )}
            {openMenu === "filters" && (
              <AssetFilterMenu
                filters={filters}
                categories={categories}
                options={filterOptions}
                onChange={resetPage(setFilters)}
              />
            )}
          </div>

          <label className="field-search asset-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => resetPage(setQuery)(event.target.value)}
              placeholder={t("Search")}
              aria-label={t("Search assets")}
            />
          </label>

          <div className="asset-toolbar-actions">
            <div className="dropdown-anchor">
              <button
                type="button"
                className="button ghost-button"
                aria-label={t("View settings")}
                title={t("View settings")}
                aria-expanded={openMenu === "view"}
                onClick={() =>
                  setOpenMenu((open) => (open === "view" ? null : "view"))
                }
              >
                <SlidersHorizontal size={16} />
                <span className="asset-toolbar-label">
                  {t("View settings")}
                </span>
                <ChevronDown size={15} />
              </button>
              {openMenu === "view" && (
                <section
                  className="dropdown-panel asset-view-menu"
                  aria-label={t("View settings")}
                >
                  <div className="asset-sort-row">
                    <ArrowUpDown size={16} />
                    <span>{t("Sort by")}</span>
                    <div className="asset-sort-direction" role="group">
                      {(
                        [
                          ["asc", "Ascending", ArrowUpNarrowWide],
                          ["desc", "Descending", ArrowDownWideNarrow],
                        ] as const
                      ).map(([value, label, Icon]) => (
                        <button
                          type="button"
                          key={value}
                          className={sortDirection === value ? "active" : ""}
                          aria-pressed={sortDirection === value}
                          aria-label={t(label)}
                          title={t(label)}
                          onClick={() => resetPage(setSortDirection)(value)}
                        >
                          <Icon size={15} />
                        </button>
                      ))}
                    </div>
                    <div className="asset-sort-field">
                      <button
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={sortListOpen}
                        onClick={() => setSortListOpen((open) => !open)}
                      >
                        {t(
                          sortOptions.find((option) => option.key === sortKey)!
                            .label,
                        )}
                        <ChevronDown size={15} />
                      </button>
                      {sortListOpen && (
                        <ul className="asset-sort-list" role="listbox">
                          {sortOptions.map((option) => (
                            <li key={option.key}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={sortKey === option.key}
                                className={
                                  sortKey === option.key ? "active" : ""
                                }
                                onClick={() => {
                                  resetPage(setSortKey)(option.key);
                                  setSortListOpen(false);
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
                </section>
              )}
            </div>

            <div className="dropdown-anchor">
              <button
                type="button"
                className="button ghost-button"
                aria-label={t("Export to")}
                title={t("Export to")}
                aria-expanded={openMenu === "export"}
                onClick={() =>
                  setOpenMenu((open) => (open === "export" ? null : "export"))
                }
              >
                <Download size={16} />
                <span className="asset-toolbar-label">{t("Export to")}</span>
                <ChevronDown size={15} />
              </button>
              {openMenu === "export" && (
                <section
                  className="dropdown-panel asset-menu"
                  aria-label={t("Export to")}
                >
                  <button type="button" onClick={exportCsv}>
                    CSV
                  </button>
                </section>
              )}
            </div>
          </div>
          <AssetActiveFilters
            filters={filters}
            categories={categories}
            options={filterOptions}
            onChange={resetPage(setFilters)}
            onEdit={() => setOpenMenu("filters")}
          />
        </div>

        <div className="asset-table-panel">
          <div className="asset-table" role="table" aria-label={t("Assets")}>
            <div
              className="asset-table-head"
              role="row"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <span role="columnheader">{t("Name")}</span>
              {columns.map((column) => (
                <span role="columnheader" key={column.key}>
                  {t(column.label)}
                </span>
              ))}
            </div>
            {pageRows.map((asset) => (
              <div
                className="asset-table-row"
                role="row"
                key={asset.id}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <span className="asset-name-cell" role="cell">
                  <span>
                    <strong>{asset.name}</strong>
                    <small>{asset.assetTag}</small>
                  </span>
                  <button
                    type="button"
                    className="asset-view-button"
                    aria-label={`${t("View asset")} ${asset.name}`}
                    title={t("View asset")}
                    onClick={() => setViewing(asset)}
                  >
                    <Eye size={16} />
                  </button>
                </span>
                {columns.map((column) => (
                  <span role="cell" key={column.key}>
                    {column.key === "serialNumber" &&
                      (asset.serialNumber || "—")}
                    {column.key === "category" && t(asset.category)}
                    {column.key === "assignee" &&
                      (asset.assignee ? (
                        <span className="asset-assignee">
                          <span className="avatar small">
                            {asset.assignee.firstName[0]}
                            {asset.assignee.lastName[0]}
                          </span>
                          <span>
                            <strong>
                              {asset.assignee.firstName}{" "}
                              {asset.assignee.lastName}
                            </strong>
                            {asset.assignee.jobTitle && (
                              <small>{asset.assignee.jobTitle}</small>
                            )}
                          </span>
                        </span>
                      ) : !asset.assignmentTracked ? (
                        "—"
                      ) : asset.status === "repair" ? (
                        <span className="asset-unassigned asset-in-repair">
                          {t("In repair")}
                        </span>
                      ) : (
                        <span className="asset-unassigned">
                          {t("To be assigned")}
                        </span>
                      ))}
                  </span>
                ))}
              </div>
            ))}
          </div>
          {visible.length === 0 && (
            <div className="compact-empty asset-empty">
              <Wrench size={18} />
              {t("No assets in this view.")}
            </div>
          )}
          <footer className="asset-pagination">
            <nav aria-label={t("Pagination")}>
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
                aria-label={t("Previous page")}
              >
                <ChevronLeft size={16} />
              </button>
              {pageList(currentPage, pageCount).map((item, index) =>
                item === "gap" ? (
                  <span key={`gap-${index}`}>…</span>
                ) : (
                  <button
                    type="button"
                    key={item}
                    className={item === currentPage ? "active" : ""}
                    aria-current={item === currentPage ? "page" : undefined}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
                aria-label={t("Next page")}
              >
                <ChevronRight size={16} />
              </button>
            </nav>
            <span>
              {visible.length === 0
                ? 0
                : `${(currentPage - 1) * PAGE_SIZE + 1} – ${Math.min(
                    currentPage * PAGE_SIZE,
                    visible.length,
                  )}`}{" "}
              {t("of")} {visible.length} {t("items")}
            </span>
          </footer>
        </div>
      </section>
      {viewing && (
        <AssetDetailsDialog asset={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  );
}
