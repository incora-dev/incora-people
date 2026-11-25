"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import {
  countAssetFilters,
  emptyAssetFilters,
  type AssetFilterKey,
  type AssetFilterOptions,
  type AssetFilters,
  type AssetFilterValue,
} from "@/modules/assets/filter-options";

type Option = {
  value: string;
  label: string;
  hint?: string;
  photoFileId?: string | null;
  initials?: string;
  children?: Option[];
};

type Group = {
  key: AssetFilterKey;
  label: string;
  options: Option[];
  searchable?: boolean;
  presence?: boolean;
};

export function buildAssetFilterGroups(
  t: (key: string) => string,
  categories: string[],
  options: AssetFilterOptions,
): Group[] {
  return [
    {
      key: "assignment",
      label: "Assignment status",
      presence: true,
      options: [
        { value: "assigned", label: t("Assigned") },
        { value: "unassigned", label: t("Not assigned") },
      ],
    },
    {
      key: "cycle",
      label: "Employment cycle",
      options: [
        { value: "working", label: t("Working employees") },
        { value: "hired", label: t("Hired employees") },
        { value: "terminated", label: t("Terminated employees") },
      ],
    },
    {
      key: "category",
      label: "Category",
      searchable: true,
      options: categories
        .map((category) => ({ value: category, label: t(category) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    },
    {
      key: "department",
      label: "Department",
      searchable: true,
      presence: true,
      options: options.departments.map((department) => ({
        value: `department:${department.name}`,
        label: department.name,
        children: department.teams.map((team) => ({
          value: `team:${team}`,
          label: team,
        })),
      })),
    },
    {
      key: "division",
      label: "Division",
      presence: true,
      options: options.divisions.map((value) => ({ value, label: value })),
    },
    {
      key: "location",
      label: "Location",
      presence: true,
      options: options.locations.map((value) => ({ value, label: value })),
    },
    {
      key: "assignee",
      label: "Assigned to",
      searchable: true,
      presence: true,
      options: options.people.map((person) => ({
        value: String(person.id),
        label: `${person.firstName} ${person.lastName}`,
        hint: person.jobTitle,
        photoFileId: person.photoFileId,
        initials: `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`,
      })),
    },
  ];
}

function toggle(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function AssetFilterMenu({
  filters,
  categories,
  options,
  onChange,
}: {
  filters: AssetFilters;
  categories: string[];
  options: AssetFilterOptions;
  onChange: (filters: AssetFilters) => void;
}) {
  const { t } = useI18n();
  const [activeKey, setActiveKey] = useState<AssetFilterKey | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);

  const groups = buildAssetFilterGroups(t, categories, options);
  const active = groups.find((group) => group.key === activeKey) ?? null;

  function update(key: AssetFilterKey, next: Partial<AssetFilterValue>) {
    onChange({ ...filters, [key]: { ...filters[key], ...next } });
  }

  function open(key: AssetFilterKey) {
    if (key === activeKey) return;
    setActiveKey(key);
    setSearch("");
  }

  const needle = search.trim().toLowerCase();
  const matches = (option: Option): boolean =>
    !needle ||
    option.label.toLowerCase().includes(needle) ||
    Boolean(option.hint?.toLowerCase().includes(needle)) ||
    Boolean(option.children?.some(matches));

  function renderOption(group: Group, option: Option, nested = false) {
    const selected = filters[group.key].values.includes(option.value);
    const children = (option.children ?? []).filter(matches);
    const isOpen = Boolean(needle) || expanded.includes(option.value);
    const hasTree = group.options.some((item) => item.children?.length);
    return (
      <li key={option.value}>
        <div className={`asset-filter-option${nested ? " nested" : ""}`}>
          {hasTree &&
            !nested &&
            (children.length ? (
              <button
                type="button"
                className="asset-filter-expand"
                aria-label={t(isOpen ? "Collapse" : "Expand")}
                aria-expanded={isOpen}
                onClick={() => setExpanded(toggle(expanded, option.value))}
              >
                {isOpen ? (
                  <ChevronDown size={15} />
                ) : (
                  <ChevronRight size={15} />
                )}
              </button>
            ) : (
              <span className="asset-filter-expand" />
            ))}
          <label>
            <input
              type="checkbox"
              checked={selected}
              onChange={() =>
                update(group.key, {
                  values: toggle(filters[group.key].values, option.value),
                })
              }
            />
            {option.initials !== undefined && (
              <span className="avatar small">
                {option.photoFileId ? (
                  <Image
                    src={`/api/files/${option.photoFileId}`}
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                  />
                ) : (
                  option.initials
                )}
              </span>
            )}
            <span>
              {option.label}
              {option.hint && <small>{option.hint}</small>}
            </span>
          </label>
        </div>
        {isOpen && children.length > 0 && (
          <ul>{children.map((child) => renderOption(group, child, true))}</ul>
        )}
      </li>
    );
  }

  return (
    <div className="asset-filter-menu">
      <ul className="dropdown-panel asset-filter-groups" role="menu">
        {groups.map((group) => {
          const count =
            filters[group.key].values.length +
            (filters[group.key].presence ? 1 : 0);
          return (
            <li key={group.key}>
              <button
                type="button"
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={activeKey === group.key}
                className={activeKey === group.key ? "active" : ""}
                onMouseEnter={() => open(group.key)}
                onFocus={() => open(group.key)}
                onClick={() => open(group.key)}
              >
                <span>{t(group.label)}</span>
                {count > 0 && <span className="filter-count">{count}</span>}
                <ChevronRight size={16} />
              </button>
            </li>
          );
        })}
        {countAssetFilters(filters) > 0 && (
          <li>
            <button
              type="button"
              className="dropdown-reset"
              onClick={() => onChange(emptyAssetFilters)}
            >
              {t("Reset filters")}
            </button>
          </li>
        )}
      </ul>
      {active && (
        <section
          className="dropdown-panel asset-filter-values"
          aria-label={t(active.label)}
        >
          {active.searchable && (
            <label className="asset-filter-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("Search")}
                aria-label={t("Search")}
              />
            </label>
          )}
          <ul className="asset-filter-list">
            {active.options
              .filter(matches)
              .map((option) => renderOption(active, option))}
            {active.options.filter(matches).length === 0 && (
              <li className="asset-filter-empty">{t("No values")}</li>
            )}
          </ul>
          {active.presence && (
            <footer className="asset-filter-presence">
              {(
                [
                  ["empty", "empty"],
                  ["filled", "not empty"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={
                    filters[active.key].presence === value ? "active" : ""
                  }
                  aria-pressed={filters[active.key].presence === value}
                  onClick={() =>
                    update(active.key, {
                      presence:
                        filters[active.key].presence === value ? null : value,
                    })
                  }
                >
                  {t(label)}
                </button>
              ))}
            </footer>
          )}
        </section>
      )}
    </div>
  );
}

function optionLabel(options: Option[], value: string): string | null {
  for (const option of options) {
    if (option.value === value) return option.label;
    const nested = option.children && optionLabel(option.children, value);
    if (nested) return nested;
  }
  return null;
}

/** The row of applied filters shown under the toolbar. */
export function AssetActiveFilters({
  filters,
  categories,
  options,
  onChange,
  onEdit,
}: {
  filters: AssetFilters;
  categories: string[];
  options: AssetFilterOptions;
  onChange: (filters: AssetFilters) => void;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const total = countAssetFilters(filters);
  if (!total) return null;
  const groups = buildAssetFilterGroups(t, categories, options).filter(
    (group) => filters[group.key].values.length || filters[group.key].presence,
  );
  return (
    <div className="asset-active-filters">
      <ul>
        {groups.map((group) => {
          const filter = filters[group.key];
          const values = [
            ...filter.values.map(
              (value) => optionLabel(group.options, value) ?? value,
            ),
            ...(filter.presence === "empty" ? [t("empty")] : []),
            ...(filter.presence === "filled" ? [t("not empty")] : []),
          ].join(", ");
          return (
            <li className="asset-active-filter" key={group.key}>
              <button
                type="button"
                className="asset-active-filter-body"
                title={`${t(group.label)} ${t("is")} ${values}`}
                onClick={onEdit}
              >
                <span className="asset-active-filter-name">
                  {t(group.label)}
                </span>
                <span className="asset-active-filter-operator">{t("is")}</span>
                <span className="asset-active-filter-values">{values}</span>
              </button>
              <button
                type="button"
                className="asset-active-filter-remove"
                aria-label={`${t("Remove filter")} ${t(group.label)}`}
                onClick={() =>
                  onChange({
                    ...filters,
                    [group.key]: emptyAssetFilters[group.key],
                  })
                }
              >
                <X size={15} />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="asset-active-filters-reset"
        onClick={() => onChange(emptyAssetFilters)}
      >
        {t("Reset")} <span className="filter-count">{total}</span>
        <X size={15} />
      </button>
    </div>
  );
}
