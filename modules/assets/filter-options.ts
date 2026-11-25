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

export type FilterableAsset = {
  category: string;
  assignee: {
    id: number | null;
    department: string;
    team: string;
    division: string;
    location: string;
    cycle: AssetEmploymentCycle;
  } | null;
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
    matchesGroup(
      filters.department,
      person
        ? [
            person.department && `department:${person.department}`,
            person.team && `team:${person.team}`,
          ]
        : [],
    ) &&
    matchesGroup(filters.division, [person?.division ?? ""]) &&
    matchesGroup(filters.location, [person?.location ?? ""]) &&
    matchesGroup(filters.assignee, person?.id ? [String(person.id)] : [])
  );
}
