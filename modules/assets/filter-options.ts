import type { EmployeeLifecycleStage } from "@/modules/people/directory";

export type AssetEmploymentCycle = "working" | "hired" | "terminated";

export type AssetFilterPerson = {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
  photoFileId: string | null;
};

export type AssetDepartmentOption = { name: string; teams: string[] };

export type AssetFilterOptions = {
  departments: AssetDepartmentOption[];
  divisions: string[];
  locations: string[];
  people: AssetFilterPerson[];
};

/** Groups the directory lifecycle stages into the three asset filter cycles. */
export function assetEmploymentCycle(
  stage: EmployeeLifecycleStage,
): AssetEmploymentCycle {
  if (stage === "terminated") return "terminated";
  if (stage === "awaiting_invitation" || stage === "probation") return "hired";
  return "working";
}

type OrgUnit = {
  id: number;
  type: string;
  name: string;
  parentId: number | null;
};

const byName = (a: string, b: string) => a.localeCompare(b);

function distinct(values: (string | null | undefined)[]) {
  return [
    ...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)),
  ].sort(byName);
}

/**
 * Builds filter choices from the org structure and the employees the viewer
 * may already see in the directory. Departments with the same name under
 * different divisions are merged into one choice.
 */
export function buildAssetFilterOptions(
  units: OrgUnit[],
  people: (AssetFilterPerson & { location: string | null })[],
): AssetFilterOptions {
  const departments = new Map<string, Set<string>>();
  const departmentUnits = units.filter((unit) => unit.type === "department");
  for (const department of departmentUnits) {
    const teams = departments.get(department.name) ?? new Set<string>();
    units
      .filter((unit) => unit.type === "team" && unit.parentId === department.id)
      .forEach((team) => teams.add(team.name));
    departments.set(department.name, teams);
  }
  return {
    departments: [...departments]
      .map(([name, teams]) => ({ name, teams: [...teams].sort(byName) }))
      .sort((a, b) => byName(a.name, b.name)),
    divisions: distinct(
      units.filter((unit) => unit.type === "division").map((unit) => unit.name),
    ),
    locations: distinct(people.map((person) => person.location)),
    people: people
      .map(({ id, firstName, lastName, jobTitle, photoFileId }) => ({
        id,
        firstName,
        lastName,
        jobTitle,
        photoFileId,
      }))
      .sort((a, b) =>
        byName(`${a.firstName} ${a.lastName}`, `${b.firstName} ${b.lastName}`),
      ),
  };
}

/**
 * Adds the departments, divisions and locations recorded on assets, so every
 * value in the register can be filtered even when it is not in the org chart.
 */
export function withAssetPlaces(
  options: AssetFilterOptions,
  assets: { department: string; division: string; location: string }[],
): AssetFilterOptions {
  const known = new Set(options.departments.map((item) => item.name));
  const extraDepartments = distinct(assets.map((asset) => asset.department))
    .filter((name) => !known.has(name))
    .map((name) => ({ name, teams: [] }));
  return {
    ...options,
    departments: [...options.departments, ...extraDepartments].sort((a, b) =>
      byName(a.name, b.name),
    ),
    divisions: distinct([
      ...options.divisions,
      ...assets.map((asset) => asset.division),
    ]),
    locations: distinct([
      ...options.locations,
      ...assets.map((asset) => asset.location),
    ]),
  };
}

export type AssetFilterKey =
  | "assignment"
  | "cycle"
  | "category"
  | "department"
  | "division"
  | "location"
  | "assignee";
export type AssetPresence = "empty" | "filled" | null;
export type AssetFilterValue = { values: string[]; presence: AssetPresence };
export type AssetFilters = Record<AssetFilterKey, AssetFilterValue>;

export const emptyAssetFilters: AssetFilters = {
  assignment: { values: [], presence: null },
  cycle: { values: [], presence: null },
  category: { values: [], presence: null },
  department: { values: [], presence: null },
  division: { values: [], presence: null },
  location: { values: [], presence: null },
  assignee: { values: [], presence: null },
};

export function countAssetFilters(filters: AssetFilters) {
  return Object.values(filters).reduce(
    (total, filter) => total + filter.values.length + (filter.presence ? 1 : 0),
    0,
  );
}

/**
 * Location, division and department belong to the asset itself (where it is
 * kept and which unit owns it), not to the person it is assigned to.
 */
export type FilterableAsset = {
  category: string;
  department: string;
  team?: string;
  division: string;
  location: string;
  assignee: { id: number | null; cycle: AssetEmploymentCycle } | null;
};

function matchesGroup(filter: AssetFilterValue, candidates: string[]): boolean {
  const present = candidates.filter(Boolean);
  if (filter.presence === "empty" && present.length) return false;
  if (filter.presence === "filled" && !present.length) return false;
  return (
    !filter.values.length ||
    present.some((value) => filter.values.includes(value))
  );
}

/**
 * Values within one filter are alternatives (OR); different filters narrow
 * each other (AND). "Empty" / "not empty" test whether the field has a value.
 */
export function matchesAssetFilters(
  asset: FilterableAsset,
  filters: AssetFilters,
) {
  const person = asset.assignee;
  const assignment = filters.assignment;
  return (
    (assignment.presence !== "empty" || !person) &&
    (assignment.presence !== "filled" || Boolean(person)) &&
    (!assignment.values.length ||
      assignment.values.includes(person ? "assigned" : "unassigned")) &&
    matchesGroup(filters.cycle, person ? [person.cycle] : []) &&
    matchesGroup(filters.category, [asset.category]) &&
    matchesGroup(filters.department, [
      asset.department && `department:${asset.department}`,
      asset.team ? `team:${asset.team}` : "",
    ]) &&
    matchesGroup(filters.division, [asset.division]) &&
    matchesGroup(filters.location, [asset.location]) &&
    matchesGroup(filters.assignee, person?.id ? [String(person.id)] : [])
  );
}
