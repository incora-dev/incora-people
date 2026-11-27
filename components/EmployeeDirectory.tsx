"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  Download,
  Filter,
  FileSpreadsheet,
  Mail,
  HousePlug,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import type {
  DataTableColumn,
  DataTableSort,
} from "@/components/ui/DataTable/types";
import type { EmployeeDirectoryItem } from "@/modules/people/types";
import { AdvancedEmployeeFilters } from "@/components/AdvancedEmployeeFilters";
import { formatEmployeeTenure, tenureYears } from "@/modules/people/tenure";
import {
  filterEmployeeDirectoryItems,
  isActiveLifecycleStage,
  sortEmployeeDirectoryItems,
  type EmployeeDirectoryCycleFilter,
  type EmployeeDirectoryLifecycleFilter,
  type EmployeeDirectorySort,
} from "@/modules/people/directory";
import type { OrgUnitDto, ReferenceValueDto } from "@/modules/admin/types";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { formatCount } from "@/lib/i18n";
import { DateField } from "@/components/ui/DateField";
import { OrgPlacementFields } from "@/components/OrgPlacementFields";
import { addCalendarMonths } from "@/modules/people/dates";

export function EmployeeDirectory({
  employees,
  canViewInactive,
  canViewNotInvited,
  canCreate,
  canExport,
  orgUnits,
  referenceValues,
  probationMonths,
  today,
}: {
  employees: EmployeeDirectoryItem[];
  canViewInactive: boolean;
  canViewNotInvited: boolean;
  canCreate: boolean;
  canExport: boolean;
  orgUnits: OrgUnitDto[];
  referenceValues: ReferenceValueDto[];
  probationMonths: number;
  today: string;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState<string[]>([]);
  const [position, setPosition] = useState<string[]>([]);
  const [division, setDivision] = useState<string[]>([]);
  const [team, setTeam] = useState<string[]>([]);
  const [workMode, setWorkMode] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [tenureRanges, setTenureRanges] = useState<string[]>([]);
  const [includeTechnologies, setIncludeTechnologies] = useState<string[]>([]);
  const [excludeTechnologies, setExcludeTechnologies] = useState<string[]>([]);
  const [technologyMode, setTechnologyMode] = useState<"all" | "any">("all");
  const [quickFilterSearch, setQuickFilterSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] =
    useState<EmployeeDirectoryLifecycleFilter>("active");
  const [employmentCycleFilter, setEmploymentCycleFilter] =
    useState<EmployeeDirectoryCycleFilter>("all");
  // One sort state for the "Sort employees" select and the column headers.
  const [sort, setSort] = useState<DataTableSort>({
    key: "person",
    direction: "asc",
  });
  const sortOrder = sortOrderFor(sort);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedIds, setAdvancedIds] = useState<number[] | null>(null);
  const [advancedCount, setAdvancedCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const departments = [...new Set(employees.map((item) => item.department))];
  const positions = [...new Set(employees.map((item) => item.jobTitle))];
  const divisions = [...new Set(employees.map((item) => item.division))];
  const teams = [
    ...new Set(employees.map((item) => item.team).filter(Boolean)),
  ] as string[];
  const workModes = ["office", "remote"];
  const levelOptions = [
    ...new Set(employees.map((item) => item.level).filter(Boolean)),
  ] as string[];
  const technologyOptions = [
    ...new Set(
      employees.flatMap((item) =>
        (item.technologies ?? "")
          .split(",")
          .map((technology) => technology.trim())
          .filter(Boolean),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const filteredByOtherFacets = useMemo(() => {
    return employees.filter((employee) => {
      const matchesDepartment =
        department.length === 0 || department.includes(employee.department);
      const matchesPosition =
        position.length === 0 || position.includes(employee.jobTitle);
      const matchesDivision =
        division.length === 0 || division.includes(employee.division);
      const matchesTeam =
        team.length === 0 ||
        (employee.team ? team.includes(employee.team) : false);
      const matchesWorkMode =
        workMode.length === 0 || workMode.includes(employee.workMode);
      const matchesLevel =
        levels.length === 0 ||
        (employee.level ? levels.includes(employee.level) : false);
      const employeeTenureYears = tenureYears(employee, today);
      const matchesTenure =
        tenureRanges.length === 0 ||
        tenureRanges.some((range) =>
          matchesTenureRange(employeeTenureYears, range),
        );
      const employeeTechnologies = (employee.technologies ?? "")
        .split(",")
        .map((technology) => technology.trim().toLowerCase())
        .filter(Boolean);
      const requestedTechnologies = includeTechnologies.map((item) =>
        item.toLowerCase(),
      );
      const matchesIncludedTechnologies =
        requestedTechnologies.length === 0 ||
        (technologyMode === "all"
          ? requestedTechnologies.every((item) =>
              employeeTechnologies.includes(item),
            )
          : requestedTechnologies.some((item) =>
              employeeTechnologies.includes(item),
            ));
      const matchesExcludedTechnologies = excludeTechnologies.every(
        (item) => !employeeTechnologies.includes(item.toLowerCase()),
      );
      return (
        (advancedIds === null || advancedIds.includes(employee.id)) &&
        matchesDepartment &&
        matchesPosition &&
        matchesDivision &&
        matchesTeam &&
        matchesWorkMode &&
        matchesLevel &&
        matchesTenure &&
        matchesIncludedTechnologies &&
        matchesExcludedTechnologies
      );
    });
  }, [
    department,
    advancedIds,
    division,
    employees,
    excludeTechnologies,
    includeTechnologies,
    levels,
    position,
    team,
    technologyMode,
    tenureRanges,
    today,
    workMode,
  ]);
  const matchingQuickFilters = useMemo(
    () =>
      filterEmployeeDirectoryItems(filteredByOtherFacets, {
        query,
        lifecycle: "all",
        employmentCycle: employmentCycleFilter,
        locale,
      }),
    [employmentCycleFilter, filteredByOtherFacets, locale, query],
  );
  const visible = useMemo(
    () =>
      sortEmployeeDirectoryItems(
        filterEmployeeDirectoryItems(matchingQuickFilters, {
          lifecycle: lifecycleFilter,
          locale,
        }),
        "name-asc",
        locale,
        today,
        tenureYears,
      ),
    [lifecycleFilter, locale, matchingQuickFilters, today],
  );
  const statusCounts = useMemo(
    () => ({
      active: matchingQuickFilters.filter((employee) =>
        isActiveLifecycleStage(employee.lifecycleStatus),
      ).length,
      awaitingInvitation: matchingQuickFilters.filter(
        (employee) => employee.lifecycleStatus === "awaiting_invitation",
      ).length,
      terminated: matchingQuickFilters.filter(
        (employee) => employee.lifecycleStatus === "terminated",
      ).length,
      all: matchingQuickFilters.length,
    }),
    [matchingQuickFilters],
  );
  const activeFilters =
    advancedCount +
    department.length +
    position.length +
    division.length +
    team.length +
    workMode.length +
    levels.length +
    tenureRanges.length +
    includeTechnologies.length +
    excludeTechnologies.length +
    (lifecycleFilter !== "all" &&
    (canViewInactive || lifecycleFilter !== "active")
      ? 1
      : 0) +
    (employmentCycleFilter !== "all" ? 1 : 0);
  const searchFilterGroup = (
    label: string,
    options: string[],
    format: (value: string) => string = (value) => value,
  ) => {
    const needle = quickFilterSearch
      .trim()
      .toLocaleLowerCase(locale === "uk" ? "uk-UA" : "en-GB");
    if (!needle) return { visible: true, options };
    const categoryMatches = t(label)
      .toLocaleLowerCase(locale === "uk" ? "uk-UA" : "en-GB")
      .includes(needle);
    const filteredOptions = categoryMatches
      ? options
      : options.filter((value) =>
          format(value)
            .toLocaleLowerCase(locale === "uk" ? "uk-UA" : "en-GB")
            .includes(needle),
        );
    return {
      visible: categoryMatches || filteredOptions.length > 0,
      options: filteredOptions,
    };
  };
  const positionGroup = searchFilterGroup("Position", positions);
  const departmentGroup = searchFilterGroup("Department", departments);
  const divisionGroup = searchFilterGroup("Division", divisions);
  const teamGroup = searchFilterGroup("Team", teams);
  const workModeGroup = searchFilterGroup("Work mode", workModes, (value) =>
    value === "remote" ? t("Remote") : t("In office"),
  );
  const levelGroup = searchFilterGroup("Level", levelOptions);
  const tenureOptions = [
    ["under-1", t("Under 1 year")],
    ["1-3", t("1–3 years")],
    ["3-5", t("3–5 years")],
    ["5-plus", t("5+ years")],
  ];
  const tenureGroup = searchFilterGroup(
    "Time at company",
    tenureOptions.map(([value]) => value),
    (value) => tenureOptions.find(([option]) => option === value)?.[1] ?? value,
  );
  const includeTechnologyGroup = searchFilterGroup(
    "Technologies to include",
    technologyOptions,
  );
  const excludeTechnologyGroup = searchFilterGroup(
    "Technologies to exclude",
    technologyOptions,
  );
  const hasFilterSearchResults = [
    positionGroup,
    departmentGroup,
    divisionGroup,
    teamGroup,
    workModeGroup,
    levelGroup,
    tenureGroup,
    includeTechnologyGroup,
    excludeTechnologyGroup,
  ].some((group) => group.visible);

  // Same columns and breakpoints as the old layout: screens up to 1500px
  // show person, position, department, team and status; phones (up to
  // 760px) show the person, with position and department underneath, and
  // the status. hideBelow N hides a column below N px, so 1501 and 761 match
  // the old max-width 1500px and 760px rules.
  const laptop = 1501;
  const phone = 761;
  // 3. Built once per locale/day: sorting and width sizing depend on it.
  const employeeColumns = useMemo<DataTableColumn<EmployeeDirectoryItem>[]>(
    () => [
      {
        key: "person",
        header: "Person",
        minWidth: 220,
        // On phones the person text wraps instead of widening the table
        // (CSS: .employee-directory-table [data-col="person"]).
        sortValue: (employee) =>
          `${employee.firstName} ${employee.lastName}`.trim(),
        cell: (employee) => (
          <span className="employee-person-cell">
            <span className="avatar">
              {employee.photoFileId ? (
                <Image
                  src={`/api/files/${employee.photoFileId}`}
                  alt=""
                  width={42}
                  height={42}
                  unoptimized
                />
              ) : (
                <>
                  {employee.firstName[0]}
                  {employee.lastName[0]}
                </>
              )}
            </span>
            <span>
              <strong>
                {employee.firstName} {employee.lastName}
              </strong>
              <small>
                <Mail size={13} /> {employee.email}
              </small>
              <small className="employee-mobile-context">
                {employee.jobTitle} · {employee.department}
                {employee.team ? ` · ${employee.team}` : ""}
              </small>
            </span>
          </span>
        ),
      },
      {
        key: "position",
        header: "Position",
        minWidth: 150,
        hideBelow: phone,
        sortValue: (employee) => employee.jobTitle,
        cell: (employee) => employee.jobTitle,
      },
      {
        key: "level",
        header: "Level",
        minWidth: 90,
        hideBelow: laptop,
        sortValue: (employee) => employee.level,
        cell: (employee) => employee.level || "—",
      },
      {
        key: "department",
        header: "Department",
        minWidth: 115,
        hideBelow: phone,
        sortValue: (employee) => employee.department,
        cell: (employee) => (
          <span className="employee-department-cell">
            {employee.department}
          </span>
        ),
      },
      {
        key: "technologies",
        header: "Technologies",
        minWidth: 180,
        hideBelow: laptop,
        sortValue: (employee) => employee.technologies,
        cell: (employee) => (
          <span className="technology-cell">
            {(employee.technologies ?? "")
              .split(",")
              .map((technology) => technology.trim())
              .filter(Boolean)
              .slice(0, 3)
              .map((technology) => (
                <em key={technology}>{technology}</em>
              ))}
            {!employee.technologies && "—"}
          </span>
        ),
      },
      {
        key: "team",
        header: "Team",
        minWidth: 105,
        hideBelow: phone,
        sortValue: (employee) => employee.team,
        cell: (employee) => employee.team || "—",
      },
      {
        key: "manager",
        header: "Manager",
        minWidth: 135,
        hideBelow: laptop,
        sortValue: (employee) => employee.managerName,
        cell: (employee) => employee.managerName || "—",
      },
      {
        key: "hireDate",
        header: "Hire date",
        minWidth: 100,
        hideBelow: laptop,
        sortValue: (employee) => employee.startDate,
        cell: (employee) => formatDate(employee.startDate, locale),
      },
      {
        key: "tenure",
        header: "Time at company",
        minWidth: 105,
        hideBelow: laptop,
        // Unknown tenure sorts last, as in the "Sort employees" select.
        sortValue: (employee) => {
          const years = tenureYears(employee, today);
          return years >= 0 ? years : null;
        },
        cell: (employee) => formatEmployeeTenure(employee, locale, today),
      },
      {
        key: "workMode",
        header: "Work mode",
        minWidth: 105,
        hideBelow: laptop,
        sortValue: (employee) =>
          employee.workMode === "remote" ? t("Remote") : t("In office"),
        cell: (employee) => (
          <span className="employee-work-mode">
            {employee.workMode === "remote" ? (
              <HousePlug size={14} />
            ) : (
              <Building2 size={14} />
            )}{" "}
            {employee.workMode === "remote" ? t("Remote") : t("In office")}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        minWidth: 88,
        sortValue: (employee) => formatStatus(employee.lifecycleStatus, t),
        cell: (employee) => (
          <span className={`status-badge ${employee.lifecycleStatus}`}>
            {formatStatus(employee.lifecycleStatus, t)}
          </span>
        ),
      },
      {
        // The arrow from the old layout: the row opens the profile.
        key: "open",
        header: "",
        minWidth: 0,
        cell: () => (
          <ChevronRight className="employee-open-cue" size={18} aria-hidden />
        ),
      },
    ],
    [locale, t, today],
  );
  return (
    <section className="panel directory-panel">
      <div className="directory-toolbar">
        <div className="directory-discovery-controls">
          <label className="field-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search people…")}
              aria-label={t("Search people")}
            />
          </label>
          <div className="dropdown-anchor">
            <button
              type="button"
              className="button ghost-button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Filter size={16} /> {t("Add filter")}
              {activeFilters > 0 && (
                <span className="filter-count">{activeFilters}</span>
              )}
            </button>
            {advancedOpen && (
              <AdvancedEmployeeFilters
                employees={employees}
                today={today}
                onClose={() => setAdvancedOpen(false)}
                onChange={(ids, count) => {
                  setAdvancedIds(ids);
                  setAdvancedCount(count);
                }}
              />
            )}
            {filtersOpen && (
              <DialogBackdrop
                className="filter-popover-layer"
                confirmWhenDirty={false}
                onClose={() => setFiltersOpen(false)}
              >
                <section
                  className="dropdown-panel filter-dropdown"
                  role="dialog"
                  aria-modal="true"
                  aria-label={t("Quick filters")}
                >
                  <div className="filter-dropdown-heading">
                    <span>
                      <strong>{t("Quick filters")}</strong>
                      <small>{t("Choose one or several values.")}</small>
                    </span>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setFiltersOpen(false)}
                      aria-label={t("Close")}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <label className="directory-filter-type-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      type="search"
                      value={quickFilterSearch}
                      onChange={(event) =>
                        setQuickFilterSearch(event.target.value)
                      }
                      placeholder={t("Search filter types")}
                      aria-label={t("Search filter types")}
                    />
                  </label>
                  {positionGroup.visible && (
                    <QuickFilterGroup
                      label={t("Position")}
                      options={positionGroup.options}
                      values={position}
                      onChange={setPosition}
                    />
                  )}
                  {departmentGroup.visible && (
                    <QuickFilterGroup
                      label={t("Department")}
                      options={departmentGroup.options}
                      values={department}
                      onChange={setDepartment}
                    />
                  )}
                  {divisionGroup.visible && (
                    <QuickFilterGroup
                      label={t("Division")}
                      options={divisionGroup.options}
                      values={division}
                      onChange={setDivision}
                    />
                  )}
                  {teamGroup.visible && (
                    <QuickFilterGroup
                      label={t("Team")}
                      options={teamGroup.options}
                      values={team}
                      onChange={setTeam}
                    />
                  )}
                  {workModeGroup.visible && (
                    <QuickFilterGroup
                      label={t("Work mode")}
                      options={workModeGroup.options}
                      values={workMode}
                      onChange={setWorkMode}
                      format={(value) =>
                        value === "remote" ? t("Remote") : t("In office")
                      }
                    />
                  )}
                  {levelGroup.visible && (
                    <fieldset className="advanced-filter-group">
                      <legend>{t("Level")}</legend>
                      <div className="filter-checks">
                        {levelGroup.options.map((item) => (
                          <label key={item}>
                            <input
                              type="checkbox"
                              checked={levels.includes(item)}
                              onChange={() =>
                                setLevels(toggleValue(levels, item))
                              }
                            />
                            {item}
                          </label>
                        ))}
                        {levelGroup.options.length === 0 && (
                          <small>{t("No values")}</small>
                        )}
                      </div>
                    </fieldset>
                  )}
                  {tenureGroup.visible && (
                    <fieldset className="advanced-filter-group">
                      <legend>{t("Time at company")}</legend>
                      <div className="filter-checks">
                        {tenureOptions
                          .filter(([value]) =>
                            tenureGroup.options.includes(value),
                          )
                          .map(([value, label]) => (
                            <label key={value}>
                              <input
                                type="checkbox"
                                checked={tenureRanges.includes(value)}
                                onChange={() =>
                                  setTenureRanges(
                                    toggleValue(tenureRanges, value),
                                  )
                                }
                              />
                              {label}
                            </label>
                          ))}
                      </div>
                    </fieldset>
                  )}
                  {includeTechnologyGroup.visible && (
                    <fieldset className="advanced-filter-group">
                      <legend>{t("Technologies to include")}</legend>
                      <div className="filter-mode-switch" role="group">
                        <button
                          type="button"
                          className={technologyMode === "all" ? "active" : ""}
                          onClick={() => setTechnologyMode("all")}
                        >
                          {t("Match all")}
                        </button>
                        <button
                          type="button"
                          className={technologyMode === "any" ? "active" : ""}
                          onClick={() => setTechnologyMode("any")}
                        >
                          {t("Match any")}
                        </button>
                      </div>
                      <div className="filter-checks technology-checks">
                        {includeTechnologyGroup.options.map((item) => (
                          <label key={item}>
                            <input
                              type="checkbox"
                              checked={includeTechnologies.includes(item)}
                              disabled={excludeTechnologies.includes(item)}
                              onChange={() =>
                                setIncludeTechnologies(
                                  toggleValue(includeTechnologies, item),
                                )
                              }
                            />
                            {item}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {excludeTechnologyGroup.visible && (
                    <fieldset className="advanced-filter-group">
                      <legend>{t("Technologies to exclude")}</legend>
                      <div className="filter-checks technology-checks">
                        {excludeTechnologyGroup.options.map((item) => (
                          <label key={item}>
                            <input
                              type="checkbox"
                              checked={excludeTechnologies.includes(item)}
                              disabled={includeTechnologies.includes(item)}
                              onChange={() =>
                                setExcludeTechnologies(
                                  toggleValue(excludeTechnologies, item),
                                )
                              }
                            />
                            {item}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {!hasFilterSearchResults && (
                    <p className="directory-filter-no-results">
                      {t("No matching filters")}
                    </p>
                  )}
                  <button
                    className="dropdown-reset"
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setQuickFilterSearch("");
                      setDepartment([]);
                      setPosition([]);
                      setDivision([]);
                      setTeam([]);
                      setWorkMode([]);
                      setLevels([]);
                      setTenureRanges([]);
                      setIncludeTechnologies([]);
                      setExcludeTechnologies([]);
                      setTechnologyMode("all");
                      setAdvancedIds(null);
                      setAdvancedCount(0);
                      setLifecycleFilter("active");
                      setEmploymentCycleFilter("all");
                    }}
                  >
                    {t("Reset filters")}
                  </button>
                  <button
                    className="button ghost-button full-button"
                    type="button"
                    onClick={() => {
                      setFiltersOpen(false);
                      setAdvancedOpen(true);
                    }}
                  >
                    <Filter size={15} /> {t("Advanced filters")}
                  </button>
                </section>
              </DialogBackdrop>
            )}
          </div>
          <label className="directory-cycle-select">
            <span>{t("Employment cycle")}</span>
            <select
              aria-label={t("Employment cycle filter")}
              value={employmentCycleFilter}
              onChange={(event) =>
                setEmploymentCycleFilter(
                  event.target.value as EmployeeDirectoryCycleFilter,
                )
              }
            >
              <option value="all">{t("All stages")}</option>
              {canViewNotInvited && (
                <option value="awaiting_invitation">{t("Not invited")}</option>
              )}
              <option value="working">{t("Working")}</option>
              <option value="probation">{t("Probation")}</option>
              <option value="on_leave">{t("On leave")}</option>
              {canViewInactive && (
                <option value="terminated">{t("Terminated")}</option>
              )}
            </select>
          </label>
          <div
            className="directory-quick-status"
            role="group"
            aria-label={t("Employee status filter")}
          >
            {(
              [
                ["active", "Active employees", statusCounts.active],
                ...(canViewNotInvited
                  ? ([
                      [
                        "awaiting_invitation",
                        "Not invited employees",
                        statusCounts.awaitingInvitation,
                      ],
                    ] as const)
                  : []),
                ...(canViewInactive
                  ? ([
                      [
                        "terminated",
                        "Terminated employees",
                        statusCounts.terminated,
                      ],
                    ] as const)
                  : []),
                ["all", "All employees", statusCounts.all],
              ] as const
            ).map(([value, label, count]) => (
              <button
                type="button"
                key={value}
                className={
                  lifecycleFilter === value ? "directory-status-active" : ""
                }
                aria-pressed={lifecycleFilter === value}
                onClick={() => setLifecycleFilter(value)}
              >
                {t(label)} <span>{count}</span>
              </button>
            ))}
          </div>
          <label className="directory-compact-select directory-sort-select">
            <span className="sr-only">{t("Sort employees")}</span>
            <select
              value={sortOrder ?? "column"}
              onChange={(event) =>
                setSort(sortFor(event.target.value as EmployeeDirectorySort))
              }
              aria-label={t("Sort employees")}
            >
              {/* Shown while a column header other than these sorts. */}
              {!sortOrder && (
                <option value="column" disabled>
                  {t(
                    employeeColumns.find((column) => column.key === sort.key)
                      ?.header ?? "Sort employees",
                  )}{" "}
                  {sort.direction === "asc" ? "↑" : "↓"}
                </option>
              )}
              <option value="name-asc">{t("Name: A–Z")}</option>
              <option value="name-desc">{t("Name: Z–A")}</option>
              <option value="tenure-desc">{t("Longest tenure")}</option>
              <option value="tenure-asc">{t("Shortest tenure")}</option>
            </select>
          </label>
        </div>
        <div className="directory-toolbar-actions">
          {canExport && (
            <Link className="button ghost-button" href="/api/employees/export">
              <Download size={16} /> {t("Export CSV")}
            </Link>
          )}
          {canCreate && (
            <>
              <button
                className="button ghost-button"
                type="button"
                onClick={() => setImportOpen(true)}
              >
                <Upload size={16} /> {t("Import CSV")}
              </button>
              <button
                className="button primary-button"
                type="button"
                onClick={() => setDialogOpen(true)}
              >
                <Plus size={17} /> {t("Add person")}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="directory-meta">
        <span>
          {formatCount(
            locale,
            visible.length,
            { one: "людина", few: "людини", many: "людей" },
            { one: "person", many: "people" },
          )}
        </span>
        <span>{t("Updated just now")}</span>
      </div>

      <DataTable
        className="employee-directory-table"
        rows={visible}
        rowKey={(employee) => employee.id}
        columns={employeeColumns}
        ariaLabel={t("Employee directory")}
        sort={sort}
        onSortChange={setSort}
        pageSize={false}
        rowHref={(employee) => `/employees/${employee.id}`}
      />

      {visible.length === 0 && (
        <div className="empty-state">
          <Search size={24} />
          <strong>{t("No people found")}</strong>
          <span>{t("Try another name or department.")}</span>
        </div>
      )}

      {dialogOpen && (
        <AddEmployeeDialog
          orgUnits={orgUnits}
          referenceValues={referenceValues}
          probationMonths={probationMonths}
          onClose={() => setDialogOpen(false)}
        />
      )}
      {importOpen && (
        <ImportEmployeesDialog onClose={() => setImportOpen(false)} />
      )}
    </section>
  );
}

function ImportEmployeesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/employees/import", {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    const result = (await response.json()) as {
      error?: string;
      message?: string;
      failed?: Array<{ row: number; error: string }>;
    };
    if (!response.ok) {
      setError(result.error ?? "Could not import the CSV.");
      setSubmitting(false);
      return;
    }
    const warning = result.failed?.length
      ? ` ${result.failed.length} row(s) could not be imported.`
      : "";
    setMessage(`${result.message ?? "Import complete."}${warning}`);
    setSubmitting(false);
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <div
        className="dialog compact-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-people-title"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Core HR")}</p>
            <h2 id="import-people-title">{t("Import people")}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} className="form-grid">
          <div className="import-guidance span-two">
            <FileSpreadsheet size={28} />
            <div>
              <strong>{t("Upload up to 250 people in one CSV")}</strong>
              <span>
                {t(
                  "Validate the column names with the template before importing.",
                )}
              </span>
            </div>
          </div>
          <label className="span-two">
            {t("CSV file")}
            <input name="file" type="file" accept=".csv,text/csv" required />
          </label>
          <Link
            className="compact-control import-template-link"
            href="/api/employees/import"
          >
            {t("Download CSV template")}
          </Link>
          {error && <p className="form-error span-two">{error}</p>}
          {message && <p className="form-success span-two">{message}</p>}
          <div className="dialog-actions span-two">
            <button
              type="button"
              className="button ghost-button"
              onClick={onClose}
            >
              {t("Close")}
            </button>
            <button className="button primary-button" disabled={submitting}>
              {submitting ? t("Importing…") : t("Import people")}
            </button>
          </div>
        </form>
      </div>
    </DialogBackdrop>
  );
}

function formatStatus(status: string, t: (key: string) => string) {
  if (status === "awaiting_invitation") return t("Not invited");
  if (status === "probation") return t("Probation");
  if (status === "terminated") return t("Terminated");
  if (status === "working") return t("Working");
  if (status === "on_leave") return t("On leave");
  if (status === "inactive") return t("Inactive");
  return t("Active");
}

function formatDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function matchesTenureRange(years: number, range: string) {
  if (years < 0) return false;
  if (range === "under-1") return years < 1;
  if (range === "1-3") return years >= 1 && years < 3;
  if (range === "3-5") return years >= 3 && years < 5;
  return years >= 5;
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function QuickFilterGroup({
  label,
  options,
  values,
  onChange,
  format = (value) => value,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  format?: (value: string) => string;
}) {
  return (
    <details className="quick-filter-group">
      <summary>
        <span>{label}</span>
        <em>{values.length || ""}</em>
      </summary>
      <div className="filter-checks">
        {options.map((item) => (
          <label key={item}>
            <input
              type="checkbox"
              checked={values.includes(item)}
              onChange={() => onChange(toggleValue(values, item))}
            />
            {format(item)}
          </label>
        ))}
        {options.length === 0 && <small>—</small>}
      </div>
    </details>
  );
}

function AddEmployeeDialog({
  onClose,
  orgUnits,
  referenceValues,
  probationMonths,
}: {
  onClose: () => void;
  orgUnits: OrgUnitDto[];
  referenceValues: ReferenceValueDto[];
  probationMonths: number;
}) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdEmployee, setCreatedEmployee] = useState<{
    id: number;
    firstName: string;
    lastName: string;
  } | null>(null);
  const [invitationBusy, setInvitationBusy] = useState(false);
  const [invitationError, setInvitationError] = useState("");
  const [invitationStatus, setInvitationStatus] = useState<
    "sent" | "failed" | "sending" | "uncertain" | null
  >(null);
  const [invitationAttemptId, setInvitationAttemptId] = useState<string | null>(
    null,
  );
  const [invitationRetrySafe, setInvitationRetrySafe] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [probationEnd, setProbationEnd] = useState("");
  const [probationManuallySet, setProbationManuallySet] = useState(false);
  const [probationResetToken, setProbationResetToken] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as {
      error?: string;
      employee?: { id: number; firstName: string; lastName: string };
    };
    if (!response.ok) {
      setError(result.error ?? "Could not add this person.");
      setSubmitting(false);
      return;
    }
    if (!result.employee?.id) {
      setError("Employee was created, but its profile could not be opened.");
      setSubmitting(false);
      return;
    }
    setCreatedEmployee(result.employee);
    setSubmitting(false);
  }

  function closeDialog() {
    onClose();
    if (createdEmployee) window.location.reload();
  }

  async function sendCreatedEmployeeInvitation() {
    if (!createdEmployee || invitationBusy || invitationStatus === "sent") {
      return;
    }
    if (invitationStatus === "uncertain" && !invitationRetrySafe) {
      setInvitationError(
        t("Check the email provider before creating another attempt."),
      );
      return;
    }
    if (
      invitationStatus === "uncertain" &&
      !window.confirm(
        t(
          "The provider may have accepted this email. Check the result safely using the same request?",
        ),
      )
    ) {
      return;
    }
    const attemptId = invitationAttemptId ?? crypto.randomUUID();
    setInvitationAttemptId(attemptId);
    setInvitationRetrySafe(true);
    setInvitationBusy(true);
    setInvitationError("");
    setInvitationStatus("sending");
    try {
      const response = await fetch(
        `/api/employees/${createdEmployee.id}/invitation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptId }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        result?: {
          status: "sent" | "failed" | "sending" | "uncertain";
          retrySafe: boolean;
        };
      };
      if (result.result?.status) setInvitationStatus(result.result.status);
      if (result.result) setInvitationRetrySafe(result.result.retrySafe);
      else if (!response.ok) setInvitationStatus(null);
      if (result.result?.status === "failed") setInvitationAttemptId(null);
      if (!response.ok) {
        setInvitationError(t(result.error ?? "Could not send the invitation."));
      } else if (
        result.result?.status === "uncertain" &&
        !result.result.retrySafe
      ) {
        setInvitationError(
          t("Check the email provider before creating another attempt."),
        );
      }
    } catch {
      setInvitationStatus("uncertain");
      setInvitationRetrySafe(true);
      setInvitationError(
        t(
          "The connection was interrupted. Check the invitation status before retrying.",
        ),
      );
    } finally {
      setInvitationBusy(false);
    }
  }

  return (
    <DialogBackdrop onClose={closeDialog}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-person-title"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Core HR")}</p>
            <h2 id="add-person-title">
              {createdEmployee ? t("Employee created") : t("Add person")}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={closeDialog}
            aria-label={t("Close")}
          >
            <X size={20} />
          </button>
        </div>
        {createdEmployee ? (
          <div className="employee-invitation-created">
            <p>
              <strong>
                {createdEmployee.firstName} {createdEmployee.lastName}
              </strong>{" "}
              {t("and the employee account were created successfully.")}
            </p>
            <p>
              {t(
                "Email invitation is optional; the employee signs in with Google using the registered work email.",
              )}
            </p>
            {invitationStatus === "sent" && (
              <p className="form-success" role="status">
                {t("The email provider accepted the invitation for sending.")}
              </p>
            )}
            {invitationError && (
              <p className="form-error" role="alert">
                {invitationError}
              </p>
            )}
            <div className="dialog-actions">
              {invitationStatus !== "sent" && (
                <button
                  type="button"
                  className="button primary-button"
                  disabled={
                    invitationBusy ||
                    invitationStatus === "sending" ||
                    (invitationStatus === "uncertain" && !invitationRetrySafe)
                  }
                  onClick={() => void sendCreatedEmployeeInvitation()}
                >
                  {invitationBusy
                    ? t("Sending invitation…")
                    : invitationStatus === "uncertain"
                      ? t("Check invitation status")
                      : invitationStatus === "failed"
                        ? t("Retry invitation")
                        : t("Send invitation by email")}
                </button>
              )}
              <button
                type="button"
                className="button ghost-button"
                onClick={closeDialog}
              >
                {t(invitationStatus === "sent" ? "Done" : "Skip invitation")}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="form-grid">
            <label>
              {t("First name")}
              <input name="firstName" required autoFocus />
            </label>
            <label>
              {t("Last name")}
              <input name="lastName" required />
            </label>
            <label className="span-two">
              {t("Work email")}
              <input name="email" type="email" required />
            </label>
            <label>
              {t("Job title")}
              <select name="jobTitle" required defaultValue="">
                <option value="" disabled>
                  {t("Select value")}
                </option>
                {referenceValues
                  .filter((item) => item.kind === "position" && item.active)
                  .map((item) => (
                    <option key={item.id}>{item.label}</option>
                  ))}
              </select>
            </label>
            <OrgPlacementFields units={orgUnits} />
            <label>
              {t("Level")}
              <select name="level" defaultValue="">
                <option value="">{t("Not specified")}</option>
                {referenceValues
                  .filter((item) => item.kind === "level" && item.active)
                  .map((item) => (
                    <option key={item.id}>{item.label}</option>
                  ))}
              </select>
            </label>
            <DateField
              name="startDate"
              label={t("Start date")}
              value={startDate}
              required
              onValueChange={(value) => {
                setStartDate(value);
                if (!probationManuallySet) {
                  setProbationEnd(addCalendarMonths(value, probationMonths));
                  setProbationResetToken((token) => token + 1);
                }
              }}
            />
            <DateField
              name="probationEnd"
              label={t("Probation end")}
              value={probationEnd}
              key={probationResetToken}
              onValueChange={(value) => {
                setProbationEnd(value);
                setProbationManuallySet(true);
              }}
            />
            {error && <p className="form-error span-two">{error}</p>}
            <div className="dialog-actions span-two">
              <button
                type="button"
                className="button ghost-button"
                onClick={onClose}
              >
                {t("Cancel")}
              </button>
              <button className="button primary-button" disabled={submitting}>
                {submitting ? t("Adding…") : t("Add person")}
              </button>
            </div>
          </form>
        )}
      </div>
    </DialogBackdrop>
  );
}

/** The "Sort employees" option for a sort, or null for another column. */
function sortOrderFor(sort: DataTableSort): EmployeeDirectorySort | null {
  if (sort.key === "person")
    return sort.direction === "asc" ? "name-asc" : "name-desc";
  if (sort.key === "tenure")
    return sort.direction === "desc" ? "tenure-desc" : "tenure-asc";
  return null;
}

function sortFor(order: EmployeeDirectorySort): DataTableSort {
  if (order === "name-desc") return { key: "person", direction: "desc" };
  if (order === "tenure-desc") return { key: "tenure", direction: "desc" };
  if (order === "tenure-asc") return { key: "tenure", direction: "asc" };
  return { key: "person", direction: "asc" };
}
