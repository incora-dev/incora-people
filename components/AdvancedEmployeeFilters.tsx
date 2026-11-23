"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search, Trash2, X } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import type { EmployeeDirectoryItem } from "@/modules/people/types";
import { tenureYears } from "@/modules/people/tenure";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { formatCount } from "@/lib/i18n";

type Field =
  | "jobTitle"
  | "department"
  | "division"
  | "team"
  | "location"
  | "workMode"
  | "employmentType"
  | "email"
  | "manager"
  | "level"
  | "tenure"
  | "technologies";
type Operator = "include_any" | "include_all" | "exclude_any";
type Condition = {
  id: string;
  field: Field;
  operator: Operator;
  values: string[];
};
const fieldNames: Record<Field, string> = {
  jobTitle: "Position",
  department: "Department",
  division: "Division",
  team: "Team",
  location: "Location",
  workMode: "Work mode",
  employmentType: "Employment type",
  email: "Email address",
  manager: "Manager",
  level: "Level",
  tenure: "Time at company",
  technologies: "Technologies",
};

export function AdvancedEmployeeFilters({
  employees,
  today,
  onClose,
  onChange,
}: {
  employees: EmployeeDirectoryItem[];
  today: string;
  onClose: () => void;
  onChange: (ids: number[], count: number) => void;
}) {
  const { locale, t } = useI18n();
  const [mode, setMode] = useState<"all" | "any">("all");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [fieldSearch, setFieldSearch] = useState("");
  const availableFields = Object.keys(fieldNames) as Field[];
  const matchingFields = fieldSearch.trim()
    ? availableFields.filter((field) =>
        t(fieldNames[field])
          .toLocaleLowerCase(locale === "uk" ? "uk-UA" : "en-GB")
          .includes(
            fieldSearch
              .trim()
              .toLocaleLowerCase(locale === "uk" ? "uk-UA" : "en-GB"),
          ),
      )
    : availableFields;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const matches = useMemo(() => {
    const activeConditions = conditions.filter(
      (condition) => condition.values.length > 0,
    );
    return employees
      .filter(
        (employee) =>
          activeConditions.length === 0 ||
          (mode === "all"
            ? activeConditions.every((condition) =>
                match(employee, condition, today),
              )
            : activeConditions.some((condition) =>
                match(employee, condition, today),
              )),
      )
      .map((employee) => employee.id);
  }, [conditions, employees, mode, today]);
  function apply() {
    onChange(
      matches,
      conditions.filter((condition) => condition.values.length > 0).length,
    );
    onClose();
  }
  function add() {
    setConditions((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        field: "department",
        operator: "include_any",
        values: [],
      },
    ]);
  }
  return (
    <DialogBackdrop className="filter-dialog-backdrop" onClose={onClose}>
      <section
        className="filter-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-dialog-title"
      >
        <header>
          <div>
            <p className="eyebrow">{t("Advanced filters")}</p>
            <h2 id="filter-dialog-title">{t("Filter people")}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={19} />
          </button>
        </header>
        <div className="filter-logic">
          <span>{t("Match")}</span>
          <button
            type="button"
            className={mode === "all" ? "active" : ""}
            aria-pressed={mode === "all"}
            onClick={() => setMode("all")}
          >
            {t("ALL conditions")}
          </button>
          <button
            type="button"
            className={mode === "any" ? "active" : ""}
            aria-pressed={mode === "any"}
            onClick={() => setMode("any")}
          >
            {t("ANY condition")}
          </button>
        </div>
        <label className="advanced-filter-type-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">{t("Search filter types")}</span>
          <input
            type="search"
            value={fieldSearch}
            onChange={(event) => setFieldSearch(event.target.value)}
            placeholder={t("Search filter types")}
            aria-label={t("Search filter types")}
          />
        </label>
        <div className="filter-condition-list">
          {conditions.map((condition) => (
            <div className="filter-condition" key={condition.id}>
              <select
                value={condition.field}
                onChange={(event) =>
                  setConditions((items) =>
                    items.map((item) =>
                      item.id === condition.id
                        ? {
                            ...item,
                            field: event.target.value as Field,
                            values: [],
                          }
                        : item,
                    ),
                  )
                }
              >
                {(matchingFields.includes(condition.field)
                  ? matchingFields
                  : [condition.field, ...matchingFields]
                ).map((field) => (
                  <option value={field} key={field}>
                    {t(fieldNames[field])}
                  </option>
                ))}
              </select>
              <select
                value={condition.operator}
                onChange={(event) =>
                  setConditions((items) =>
                    items.map((item) =>
                      item.id === condition.id
                        ? { ...item, operator: event.target.value as Operator }
                        : item,
                    ),
                  )
                }
              >
                <option value="include_any">{t("is any of")}</option>
                <option value="include_all">{t("contains all")}</option>
                <option value="exclude_any">{t("is none of")}</option>
              </select>
              <details className="condition-value-picker">
                <summary>
                  <span>
                    {condition.values.length
                      ? `${condition.values.length} ${t("selected")}`
                      : t("Select values")}
                  </span>
                  <ChevronDown size={15} />
                </summary>
                <div>
                  {optionsFor(employees, condition.field).map((value) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        checked={condition.values.includes(value)}
                        onChange={() =>
                          setConditions((items) =>
                            items.map((item) =>
                              item.id === condition.id
                                ? {
                                    ...item,
                                    values: item.values.includes(value)
                                      ? item.values.filter(
                                          (entry) => entry !== value,
                                        )
                                      : [...item.values, value],
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      <span>{formatValue(value, t)}</span>
                      {condition.values.includes(value) && <Check size={13} />}
                    </label>
                  ))}
                </div>
              </details>
              <button
                className="icon-button"
                type="button"
                onClick={() =>
                  setConditions((items) =>
                    items.filter((item) => item.id !== condition.id),
                  )
                }
                aria-label={t("Remove filter")}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {conditions.length === 0 && (
            <p className="muted">
              {t("Add conditions to narrow the people directory.")}
            </p>
          )}
        </div>
        <footer>
          <button
            className="button ghost-button"
            type="button"
            disabled={conditions.length >= 16}
            onClick={add}
          >
            <Plus size={16} /> {t("Add condition")}
          </button>
          <span>
            {formatCount(
              locale,
              matches.length,
              { one: "людина", few: "людини", many: "людей" },
              { one: "person", many: "people" },
            )}
          </span>
          <button
            className="button ghost-button"
            type="button"
            onClick={() => {
              setConditions([]);
              onChange(
                employees.map((employee) => employee.id),
                0,
              );
            }}
          >
            {t("Reset filters")}
          </button>
          <button
            className="button primary-button"
            type="button"
            onClick={apply}
          >
            {t("Show people")}
          </button>
        </footer>
      </section>
    </DialogBackdrop>
  );
}

function optionsFor(employees: EmployeeDirectoryItem[], field: Field) {
  if (field === "tenure") return ["under-1", "1-3", "3-5", "5-plus"];
  if (field === "technologies")
    return [
      ...new Set(
        employees.flatMap((employee) =>
          (employee.technologies ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ),
    ].sort();
  const values = employees
    .map((employee) => {
      if (field === "manager") return employee.managerName ?? "";
      return String(employee[field] ?? "");
    })
    .filter(Boolean);
  return [...new Set(values)].sort();
}
function match(
  employee: EmployeeDirectoryItem,
  condition: Condition,
  today: string,
) {
  if (!condition.values.length) return true;
  const actual =
    condition.field === "technologies"
      ? (employee.technologies ?? "")
          .split(",")
          .map((item) => item.trim().toLowerCase())
      : condition.field === "tenure"
        ? tenureBuckets(employee, today)
        : condition.field === "manager"
          ? [String(employee.managerName ?? "").toLowerCase()]
          : [String(employee[condition.field] ?? "").toLowerCase()];
  const expected = condition.values.map((value) => value.toLowerCase());
  if (condition.operator === "exclude_any")
    return expected.every((value) => !actual.includes(value));
  if (condition.operator === "include_all")
    return expected.every((value) => actual.includes(value));
  return expected.some((value) => actual.includes(value));
}
function tenureBuckets(employee: EmployeeDirectoryItem, today: string) {
  const years = tenureYears(employee, today);
  if (years < 0) return ["not-started"];
  return [
    years < 1 ? "under-1" : years < 3 ? "1-3" : years < 5 ? "3-5" : "5-plus",
  ];
}
function formatValue(value: string, t: (key: string) => string) {
  if (value === "under-1") return t("Under 1 year");
  if (value === "1-3") return t("1–3 years");
  if (value === "3-5") return t("3–5 years");
  if (value === "5-plus") return t("5+ years");
  if (value === "remote") return t("Remote");
  if (value === "office") return t("In office");
  return t(value);
}
