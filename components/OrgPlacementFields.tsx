"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import type { OrgUnitDto } from "@/modules/admin/types";

export function OrgPlacementFields({
  units,
  initialDivisionId,
  initialDepartmentId,
  initialTeamId,
  division: initialDivision = "",
  department: initialDepartment = "",
  team: initialTeam = "",
}: {
  units: OrgUnitDto[];
  initialDivisionId?: number | null;
  initialDepartmentId?: number | null;
  initialTeamId?: number | null;
  division?: string;
  department?: string;
  team?: string;
}) {
  const { t } = useI18n();
  const [divisionId, setDivisionId] = useState(
    String(
      initialDivisionId ??
        findByName(units, "division", initialDivision)?.id ??
        "",
    ),
  );
  const [departmentId, setDepartmentId] = useState(
    String(
      initialDepartmentId ??
        findByName(units, "department", initialDepartment)?.id ??
        "",
    ),
  );
  const [teamId, setTeamId] = useState(
    String(initialTeamId ?? findByName(units, "team", initialTeam)?.id ?? ""),
  );
  const [departmentTouched, setDepartmentTouched] = useState(false);
  const [teamTouched, setTeamTouched] = useState(false);
  const divisions = units.filter(
    (unit) =>
      unit.type === "division" &&
      (unit.active || String(unit.id) === divisionId),
  );
  const selectedDivision = units.find((unit) => String(unit.id) === divisionId);
  const selectedDepartment = units.find(
    (unit) => String(unit.id) === departmentId,
  );
  const departments = units.filter(
    (unit) =>
      unit.type === "department" &&
      (unit.active || unit.id === selectedDepartment?.id) &&
      (!selectedDivision ||
        unit.parentId === null ||
        unit.parentId === selectedDivision.id),
  );
  const teams = units.filter(
    (unit) =>
      unit.type === "team" &&
      (unit.active || String(unit.id) === teamId) &&
      (!selectedDepartment ||
        unit.parentId === null ||
        unit.parentId === selectedDepartment.id),
  );
  const labels = useMemo(
    () => ({
      division: selectedDivision?.name ?? initialDivision,
      department:
        selectedDepartment?.name ??
        (departmentTouched ? "" : initialDepartment),
      team:
        units.find((unit) => String(unit.id) === teamId)?.name ??
        (teamTouched ? "" : initialTeam),
    }),
    [
      selectedDivision,
      selectedDepartment,
      units,
      teamId,
      initialDivision,
      initialDepartment,
      initialTeam,
      departmentTouched,
      teamTouched,
    ],
  );

  return (
    <>
      <input type="hidden" name="division" value={labels.division} />
      <input type="hidden" name="department" value={labels.department} />
      <input type="hidden" name="team" value={labels.team} />
      <label>
        {t("Division")}
        <select
          name="divisionUnitId"
          value={divisionId}
          onChange={(event) => {
            const nextId = event.target.value;
            setDivisionId(nextId);
            setDepartmentTouched(true);
            const nextDivision = units.find(
              (unit) => String(unit.id) === nextId,
            );
            if (
              selectedDepartment?.parentId &&
              selectedDepartment.parentId !== nextDivision?.id
            ) {
              setDepartmentId("");
              setTeamId("");
              setTeamTouched(true);
            }
          }}
          required
        >
          <option value="" disabled>
            {t("Select value")}
          </option>
          {divisions.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Department")}
        <select
          name="departmentUnitId"
          value={departmentId}
          onChange={(event) => {
            setDepartmentId(event.target.value);
            setDepartmentTouched(true);
            const nextDepartment = units.find(
              (unit) => String(unit.id) === event.target.value,
            );
            if (
              units.find((unit) => unit.id === Number(teamId))?.parentId &&
              units.find((unit) => unit.id === Number(teamId))?.parentId !==
                nextDepartment?.id
            ) {
              setTeamId("");
              setTeamTouched(true);
            }
          }}
          required
        >
          <option value="" disabled>
            {t("Select value")}
          </option>
          {departments.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Team")}
        <select
          name="teamUnitId"
          value={teamId}
          onChange={(event) => {
            setTeamId(event.target.value);
            setTeamTouched(true);
          }}
        >
          <option value="">{t("No team")}</option>
          {teams.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function findByName(units: OrgUnitDto[], type: string, name: string) {
  return units.find((unit) => unit.type === type && unit.name === name);
}
