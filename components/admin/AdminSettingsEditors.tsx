"use client";

import { FormEvent, useState } from "react";
import { Check, X } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { OrgPlacementFields } from "@/components/OrgPlacementFields";
import type {
  ExpensePolicyDto,
  LeaveBalanceDto,
  LeaveTypeDto,
  OrgUnitDto,
  ReportingPersonDto,
} from "@/modules/admin/types";

export function LeavePolicyDialog({
  policy,
  year,
  onClose,
  onSaved,
}: {
  policy: LeaveTypeDto;
  year: number;
  onClose: () => void;
  onSaved: (policy: LeaveTypeDto) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/leave-types/${policy.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        color: data.get("color"),
        defaultAllowance: Number(data.get("defaultAllowance")),
        requiresApproval: data.get("requiresApproval") === "on",
        applyToExisting: data.get("applyToExisting") === "on",
      }),
    });
    const result = (await response.json()) as {
      policy?: LeaveTypeDto;
      error?: string;
    };
    if (response.ok && result.policy) onSaved(result.policy);
    else setError(result.error ?? t("Could not save policy."));
  }
  return (
    <DialogBackdrop onClose={onClose}>
      <div className="dialog small-dialog">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Leave policy")}</p>
            <h2>
              {t("Edit")} {policy.name}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label className="span-two">
            {t("Name")}
            <input name="name" defaultValue={policy.name} required />
          </label>
          <label>
            {t("Default days")}
            <input
              name="defaultAllowance"
              type="number"
              min="0"
              defaultValue={policy.defaultAllowance}
              required
            />
          </label>
          <label>
            {t("Color")}
            <input name="color" type="color" defaultValue={policy.color} />
          </label>
          <label className="checkbox-field span-two">
            <input
              name="requiresApproval"
              type="checkbox"
              defaultChecked={policy.requiresApproval}
            />{" "}
            {t("Requests require approval")}
          </label>
          <label className="checkbox-field span-two">
            <input name="applyToExisting" type="checkbox" />{" "}
            {t("Apply the default allowance to all existing")} {year}{" "}
            {t("balances")}
          </label>
          {error && <p className="form-error span-two">{error}</p>}
          <div className="dialog-actions span-two">
            <button
              type="button"
              className="button ghost-button"
              onClick={onClose}
            >
              {t("Cancel")}
            </button>
            <button className="button primary-button">
              {t("Save policy")}
            </button>
          </div>
        </form>
      </div>
    </DialogBackdrop>
  );
}

export function BalanceDialog({
  balance,
  onClose,
  onSaved,
}: {
  balance: LeaveBalanceDto;
  onClose: () => void;
  onSaved: (
    balance: Pick<LeaveBalanceDto, "id" | "allowance" | "adjustment">,
  ) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/leave-balances/${balance.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        allowance: Number(data.get("allowance")),
        adjustment: Number(data.get("adjustment")),
      }),
    });
    const result = (await response.json()) as {
      balance?: Pick<LeaveBalanceDto, "id" | "allowance" | "adjustment">;
      error?: string;
    };
    if (response.ok && result.balance) onSaved(result.balance);
    else setError(result.error ?? t("Could not save balance."));
  }
  return (
    <DialogBackdrop onClose={onClose}>
      <div className="dialog small-dialog">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Individual balance")}</p>
            <h2>
              {balance.firstName} {balance.lastName} · {balance.typeName}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            {t("Annual allowance")}
            <input
              name="allowance"
              type="number"
              min="0"
              defaultValue={balance.allowance}
              required
            />
          </label>
          <label>
            {t("Adjustment")}
            <input
              name="adjustment"
              type="number"
              defaultValue={balance.adjustment}
              required
            />
          </label>
          <p className="muted span-two">
            {t("Used days")} ({balance.used}){" "}
            {t(
              "are calculated from approved requests and cannot be edited directly.",
            )}
          </p>
          {error && <p className="form-error span-two">{error}</p>}
          <div className="dialog-actions span-two">
            <button
              type="button"
              className="button ghost-button"
              onClick={onClose}
            >
              {t("Cancel")}
            </button>
            <button className="button primary-button">
              {t("Save balance")}
            </button>
          </div>
        </form>
      </div>
    </DialogBackdrop>
  );
}

export function ExpensePolicySettings({
  policies,
  onSaved,
}: {
  policies: ExpensePolicyDto[];
  onSaved: (policy: ExpensePolicyDto) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  if (!policies.length)
    return (
      <div className="panel compact-empty">
        Політику відшкодувань не налаштовано.
      </div>
    );
  const policy = policies[0];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/admin/reimbursement-policies/${policy.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          currency: data.get("currency"),
          perRequestLimit: Number(data.get("perRequestLimit")),
          annualLimit: Number(data.get("annualLimit")),
          maxRequestsPerYear: Number(data.get("maxRequestsPerYear")),
          requiresReceipt: data.get("requiresReceipt") === "on",
          requiresApproval: data.get("requiresApproval") === "on",
          enabled: data.get("enabled") === "on",
        }),
      },
    );
    const result = (await response.json()) as {
      policy?: ExpensePolicyDto;
      error?: string;
    };
    if (response.ok && result.policy) onSaved(result.policy);
    else setError(result.error ?? t("Could not save reimbursement policy."));
  }
  return (
    <section className="panel policy-editor">
      <div className="data-panel-heading">
        <div>
          <h2>{t("Reimbursement policy")}</h2>
          <span>{t("Limits apply to every active employee account")}</span>
        </div>
        <span
          className={`status-badge ${policy.enabled ? "active" : "inactive"}`}
        >
          {policy.enabled ? t("Enabled") : t("Disabled")}
        </span>
      </div>
      <form className="form-grid policy-form" onSubmit={submit}>
        <label className="span-two">
          {t("Policy name")}
          <input name="name" defaultValue={policy.name} required />
        </label>
        <label>
          {t("Currency")}
          <select name="currency" defaultValue={policy.currency}>
            <option>UAH</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
        </label>
        <label>
          {t("Requests per year")}
          <input
            name="maxRequestsPerYear"
            type="number"
            min="1"
            defaultValue={policy.maxRequestsPerYear}
            required
          />
        </label>
        <label>
          {t("Maximum per request")}
          <input
            name="perRequestLimit"
            type="number"
            min="1"
            defaultValue={policy.perRequestLimit / 100}
            required
          />
        </label>
        <label>
          {t("Annual amount limit")}
          <input
            name="annualLimit"
            type="number"
            min="1"
            defaultValue={policy.annualLimit / 100}
            required
          />
        </label>
        <label className="checkbox-field">
          <input
            name="requiresReceipt"
            type="checkbox"
            defaultChecked={policy.requiresReceipt}
          />{" "}
          {t("Receipt is required")}
        </label>
        <label className="checkbox-field">
          <input
            name="requiresApproval"
            type="checkbox"
            defaultChecked={policy.requiresApproval}
          />{" "}
          {t("Manager or HR approval")}
        </label>
        <label className="checkbox-field span-two">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={policy.enabled}
          />{" "}
          {t("Policy is active and employees may submit expenses")}
        </label>
        {error && <p className="form-error span-two">{error}</p>}
        <div className="dialog-actions span-two">
          <button className="button primary-button">
            {t("Save reimbursement policy")}
          </button>
        </div>
      </form>
    </section>
  );
}

export function OrganizationSettings({
  units,
  people,
  onUnitsChange,
  onPeopleChange,
  onMessage,
}: {
  units: OrgUnitDto[];
  people: ReportingPersonDto[];
  onUnitsChange: React.Dispatch<React.SetStateAction<OrgUnitDto[]>>;
  onPeopleChange: React.Dispatch<React.SetStateAction<ReportingPersonDto[]>>;
  onMessage: (message: string) => void;
}) {
  const { t } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  return (
    <>
      <section className="panel data-panel">
        <div className="data-panel-heading">
          <div>
            <h2>{t("Organization units")}</h2>
            <span>{t("Company, divisions, departments and teams")}</span>
          </div>
          <button
            className="button primary-button"
            onClick={() => setAddOpen(true)}
          >
            <span aria-hidden="true">＋</span> {t("Add unit")}
          </button>
        </div>
        <div className="org-admin-list">
          {units.map((unit) => (
            <OrgUnitRow
              key={unit.id}
              unit={unit}
              units={units}
              people={people}
              onSaved={(saved) => {
                onUnitsChange((items) =>
                  items.map((item) => (item.id === saved.id ? saved : item)),
                );
                onMessage(t("Organization unit updated."));
              }}
            />
          ))}
        </div>
      </section>
      <section className="panel data-panel">
        <div className="data-panel-heading">
          <div>
            <h2>{t("Reporting lines & placement")}</h2>
            <span>{t("Changes immediately update the live org chart")}</span>
          </div>
        </div>
        <div className="reporting-admin-list">
          {people.map((person) => (
            <ReportingRow
              key={person.id}
              person={person}
              people={people}
              units={units}
              onSaved={(saved) => {
                onPeopleChange((items) =>
                  items.map((item) =>
                    item.id === saved.id ? { ...item, ...saved } : item,
                  ),
                );
                onMessage(t("Reporting line updated."));
              }}
            />
          ))}
        </div>
      </section>
      {addOpen && (
        <AddUnitDialog
          units={units}
          people={people}
          onClose={() => setAddOpen(false)}
          onCreated={(unit) => {
            onUnitsChange((items) => [...items, unit]);
            setAddOpen(false);
            onMessage(t("Organization unit created."));
          }}
        />
      )}
    </>
  );
}

function OrgUnitRow({
  unit,
  units,
  people,
  onSaved,
}: {
  unit: OrgUnitDto;
  units: OrgUnitDto[];
  people: ReportingPersonDto[];
  onSaved: (unit: OrgUnitDto) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const parentType =
    unit.type === "department"
      ? "division"
      : unit.type === "team"
        ? "department"
        : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/org-units/${unit.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        parentId: data.get("parentId"),
        leadEmployeeId: data.get("leadEmployeeId"),
        active: data.get("active") === "on",
      }),
    });
    const result = (await response.json()) as {
      unit?: OrgUnitDto;
      error?: string;
    };
    if (response.ok && result.unit) onSaved(result.unit);
    else setError(result.error ?? t("Could not save unit."));
  }
  return (
    <form onSubmit={submit}>
      <span className="org-unit-type">{t(unit.type)}</span>
      <input
        name="name"
        defaultValue={unit.name}
        aria-label={`${unit.name} name`}
      />
      <select
        name="parentId"
        defaultValue={unit.parentId ?? ""}
        disabled={!parentType}
        required={unit.parentId !== null && parentType !== null}
      >
        <option value="">{t("No parent")}</option>
        {units
          .filter((item) => item.id !== unit.id && item.type === parentType)
          .map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
      </select>
      <select name="leadEmployeeId" defaultValue={unit.leadEmployeeId ?? ""}>
        <option value="">{t("No lead")}</option>
        {people.map((person) => (
          <option value={person.id} key={person.id}>
            {person.firstName} {person.lastName}
          </option>
        ))}
      </select>
      <label className="compact-switch">
        <input name="active" type="checkbox" defaultChecked={unit.active} />
        <span className="compact-switch-box" aria-hidden="true">
          <Check size={12} />
        </span>
        <span>{t("Active")}</span>
      </label>
      <button
        className="button ghost-button"
        aria-label={`${t("Save")} ${unit.name}`}
      >
        {t("Save")}
      </button>
      {error && <small className="form-error">{error}</small>}
    </form>
  );
}

function ReportingRow({
  person,
  people,
  units,
  onSaved,
}: {
  person: ReportingPersonDto;
  people: ReportingPersonDto[];
  units: OrgUnitDto[];
  onSaved: (person: ReportingPersonDto) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/reporting/${person.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data.entries())),
    });
    const result = (await response.json()) as {
      employee?: ReportingPersonDto;
      error?: string;
    };
    if (response.ok && result.employee) onSaved(result.employee);
    else setError(result.error ?? t("Could not update reporting."));
  }
  return (
    <form onSubmit={submit}>
      <span className="employee-person-cell">
        <span className="avatar small">
          {person.firstName[0]}
          {person.lastName[0]}
        </span>
        <span>
          <strong>
            {person.firstName} {person.lastName}
          </strong>
          <small>{person.jobTitle}</small>
        </span>
      </span>
      <select name="managerId" defaultValue={person.managerId ?? ""}>
        <option value="">{t("No manager")}</option>
        {people
          .filter((item) => item.id !== person.id)
          .map((item) => (
            <option value={item.id} key={item.id}>
              {item.firstName} {item.lastName}
            </option>
          ))}
      </select>
      <OrgPlacementFields
        units={units}
        initialDivisionId={person.divisionUnitId}
        initialDepartmentId={person.departmentUnitId}
        initialTeamId={person.teamUnitId}
        division={person.division}
        department={person.department}
        team={person.team ?? ""}
      />
      <button
        className="button ghost-button"
        aria-label={`${t("Save")} ${person.firstName} ${person.lastName}`}
      >
        {t("Save")}
      </button>
      {error && <small className="form-error">{error}</small>}
    </form>
  );
}

function AddUnitDialog({
  units,
  people,
  onClose,
  onCreated,
}: {
  units: OrgUnitDto[];
  people: ReportingPersonDto[];
  onClose: () => void;
  onCreated: (unit: OrgUnitDto) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [unitType, setUnitType] = useState<"division" | "department" | "team">(
    "division",
  );
  const parentType =
    unitType === "department"
      ? "division"
      : unitType === "team"
        ? "department"
        : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const response = await fetch("/api/admin/org-units", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as {
      unit?: OrgUnitDto;
      error?: string;
    };
    if (response.ok && result.unit) onCreated(result.unit);
    else setError(result.error ?? t("Could not create unit."));
  }
  return (
    <DialogBackdrop onClose={onClose}>
      <div className="dialog small-dialog">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Organization")}</p>
            <h2>{t("Add organization unit")}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            {t("Type")}
            <select
              name="type"
              value={unitType}
              onChange={(event) =>
                setUnitType(event.target.value as typeof unitType)
              }
            >
              <option value="division">{t("Division")}</option>
              <option value="department">{t("Department")}</option>
              <option value="team">{t("Team")}</option>
            </select>
          </label>
          <label>
            {t("Name")}
            <input name="name" required />
          </label>
          <label>
            {t("Parent")}
            <select
              name="parentId"
              required={parentType !== null}
              disabled={parentType === null}
            >
              <option value="">
                {t(parentType ? "Select parent" : "No parent")}
              </option>
              {units
                .filter((unit) => unit.type === parentType && unit.active)
                .map((unit) => (
                  <option value={unit.id} key={unit.id}>
                    {unit.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t("Lead")}
            <select name="leadEmployeeId">
              <option value="">{t("No lead")}</option>
              {people.map((person) => (
                <option value={person.id} key={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="form-error span-two">{error}</p>}
          <div className="dialog-actions span-two">
            <button
              type="button"
              className="button ghost-button"
              onClick={onClose}
            >
              {t("Cancel")}
            </button>
            <button className="button primary-button">
              {t("Create unit")}
            </button>
          </div>
        </form>
      </div>
    </DialogBackdrop>
  );
}
