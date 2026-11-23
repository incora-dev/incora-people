import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { employmentTypes, orgUnits, referenceValues } from "@/db/schema";
import { ApplicationError } from "@/modules/shared/application-error";

export type EmployeeReferenceInput = {
  division: string;
  department: string;
  team: string;
  jobTitle: string;
  level: string;
  employmentType: string;
  divisionUnitId?: number;
  departmentUnitId?: number;
  teamUnitId?: number;
};

export async function resolveEmployeeReferences(input: EmployeeReferenceInput) {
  const db = getDb();
  const [units, values, employmentTypeRows] = await Promise.all([
    db.select().from(orgUnits).where(eq(orgUnits.active, true)),
    db.select().from(referenceValues).where(eq(referenceValues.active, true)),
    db.select().from(employmentTypes).where(eq(employmentTypes.active, true)),
  ]);
  const unit = (
    type: string,
    label: string,
    required: boolean,
    id?: number,
  ) => {
    if (!label.trim() && !required) return null;
    const match = units.find(
      (item) =>
        item.type === type &&
        (id ? item.id === id : normalize(item.name) === normalize(label)),
    );
    if (!match)
      throw new ApplicationError(
        `Select ${type} from the managed organization structure.`,
        400,
        `invalid_${type}_reference`,
      );
    return match;
  };
  const value = (kind: string, label: string, required: boolean) => {
    if (!label.trim() && !required) return null;
    const match = values.find(
      (item) =>
        item.kind === kind && normalize(item.label) === normalize(label),
    );
    if (!match)
      throw new ApplicationError(
        `Select ${kind} from the managed profile catalogue.`,
        400,
        `invalid_${kind}_reference`,
      );
    return match;
  };
  const division = unit(
    "division",
    input.division,
    true,
    input.divisionUnitId,
  )!;
  const department = unit(
    "department",
    input.department,
    true,
    input.departmentUnitId,
  )!;
  const team = unit("team", input.team, false, input.teamUnitId);
  if (department.parentId !== null && department.parentId !== division.id)
    throw new ApplicationError(
      "Choose a department within the selected division.",
      400,
      "department_division_mismatch",
    );
  if (
    team?.parentId !== null &&
    team?.parentId !== undefined &&
    team.parentId !== department.id
  )
    throw new ApplicationError(
      "Choose a team within the selected department.",
      400,
      "team_department_mismatch",
    );
  const position = value("position", input.jobTitle, true)!;
  const level = value("level", input.level, false);
  const employmentType = employmentTypeRows.find(
    (item) => normalize(item.label) === normalize(input.employmentType),
  );
  if (!employmentType)
    throw new ApplicationError(
      "Select employment type from the managed company catalogue.",
      400,
      "invalid_employment_type_reference",
    );
  return {
    division,
    department,
    team,
    position,
    level,
    employmentType,
    canonical: {
      division: division.name,
      department: department.name,
      team: team?.name ?? null,
      jobTitle: position.label,
      level: level?.label ?? null,
      employmentType: employmentType.label,
    },
  };
}

export async function assertTechnologyReferences(labels: string[]) {
  if (!labels.length) return [];
  const rows = await getDb()
    .select({ id: referenceValues.id, label: referenceValues.label })
    .from(referenceValues)
    .where(
      and(
        eq(referenceValues.kind, "technology"),
        eq(referenceValues.active, true),
      ),
    );
  const selected = new Set(labels.map(normalize));
  const matches = rows.filter((row) => selected.has(normalize(row.label)));
  if (matches.length !== selected.size)
    throw new ApplicationError(
      "Select technologies from the managed company catalogue.",
      400,
      "invalid_technology_reference",
    );
  return matches;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("uk-UA");
}
