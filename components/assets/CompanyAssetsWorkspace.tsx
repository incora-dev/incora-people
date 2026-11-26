"use client";

import { useMemo, useRef, useState } from "react";
import { Eye, Filter, Search, Wrench, X } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { useDismissibleLayer } from "@/components/ui/useDismissibleLayer";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import type {
  DataTableColumn,
  DataTableSortOption,
} from "@/components/ui/DataTable/types";
import { AssetDetailsDialog } from "@/components/assets/AssetDetailsDialog";
import {
  AssetActiveFilters,
  AssetFilterMenu,
} from "@/components/assets/AssetFilterMenu";
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

// Categories of the inventory groups shown on this page.
const categories = ["laptop", "monitor", "written_off"];

function assigneeName(asset: Asset) {
  return asset.assignee
    ? `${asset.assignee.firstName} ${asset.assignee.lastName}`
    : "";
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
  const [viewing, setViewing] = useState<Asset | null>(null);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useDismissibleLayer(filtersOpen, toolbarRef, () => setFiltersOpen(false));

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
  const archivedCount = scoped.filter(
    (asset) => asset.status === "retired",
  ).length;
  const activeCount = scoped.length - archivedCount;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scoped.filter((asset) => {
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
  }, [scoped, lifecycle, filters, query]);
  const activeFilters = countAssetFilters(filters);

  const columns = useMemo<DataTableColumn<Asset>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        width: "minmax(280px, 1.4fr)",
        sortValue: (asset) => asset.name,
        exportHeader: ["Name", "Asset tag"],
        exportValue: (asset) => [asset.name, asset.assetTag],
        cell: (asset) => (
          <span className="asset-name-cell">
            <strong>{asset.name}</strong>
            <small>{asset.assetTag}</small>
          </span>
        ),
      },
      {
        key: "serialNumber",
        header: "Serial number",
        sortValue: (asset) => asset.serialNumber,
        cell: (asset) => asset.serialNumber || "—",
      },
      {
        key: "category",
        header: "Category",
        sortValue: (asset) => t(asset.category),
        cell: (asset) => t(asset.category),
      },
      {
        key: "assignee",
        header: "Assigned to",
        width: "minmax(200px, 1.6fr)",
        // Nobody assigned sorts last.
        sortValue: assigneeName,
        exportValue: (asset) =>
          asset.assignee
            ? assigneeName(asset)
            : asset.status === "repair"
              ? t("In repair")
              : "",
        cell: (asset) =>
          asset.assignee ? (
            <span className="asset-assignee">
              <span className="avatar small">
                {asset.assignee.firstName[0]}
                {asset.assignee.lastName[0]}
              </span>
              <span>
                <strong>
                  {asset.assignee.firstName} {asset.assignee.lastName}
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
            <span className="asset-unassigned">{t("To be assigned")}</span>
          ),
      },
    ],
    [t],
  );
  const sortOptions = useMemo<DataTableSortOption<Asset>[]>(
    () => [
      { key: "code", label: "Code", sortValue: (asset) => asset.assetTag },
      { key: "name", label: "Name" },
      { key: "serialNumber", label: "Serial number" },
      { key: "category", label: "Category" },
      { key: "assignee", label: "Assigned to" },
    ],
    [],
  );

  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
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
        <DataTable
          rows={visible}
          rowKey={(asset) => asset.id}
          columns={columns}
          ariaLabel={t("Assets")}
          defaultSort={{ key: "code", direction: "asc" }}
          sortMenu={sortOptions}
          page={page}
          onPageChange={setPage}
          exportFileName="assets"
          empty={{ icon: Wrench, text: t("No assets in this view.") }}
          rowActions={(asset) => [
            {
              icon: Eye,
              label: t("View asset"),
              onClick: () => setViewing(asset),
            },
          ]}
          toolbar={({ viewSettings, exportMenu }) => (
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
                  {t("Archived assets")} <span>{archivedCount}</span>
                </button>
              </div>

              <div className="dropdown-anchor">
                {activeFilters > 0 ? (
                  <div className="asset-filter-trigger">
                    <button
                      type="button"
                      aria-expanded={filtersOpen}
                      onClick={() => setFiltersOpen((open) => !open)}
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
                    aria-expanded={filtersOpen}
                    onClick={() => setFiltersOpen((open) => !open)}
                  >
                    <Filter size={16} /> {t("Add filter")}
                  </button>
                )}
                {filtersOpen && (
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

              {/* Opening View settings or Export closes the filter menu. */}
              <div
                className="asset-toolbar-actions"
                onPointerDownCapture={() => setFiltersOpen(false)}
              >
                {viewSettings}
                {exportMenu}
              </div>
              <AssetActiveFilters
                filters={filters}
                categories={categories}
                options={filterOptions}
                onChange={resetPage(setFilters)}
                onEdit={() => setFiltersOpen(true)}
              />
            </div>
          )}
        />
      </section>
      {viewing && (
        <AssetDetailsDialog asset={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  );
}
