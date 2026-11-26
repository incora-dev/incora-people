"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bug,
  Activity,
  AlertCircle,
  CalendarRange,
  Clock3,
  Check,
  Database,
  Download,
  KeyRound,
  Pencil,
  Search,
  ShieldCheck,
  Network,
  PackageSearch,
  ReceiptText,
  Users,
} from "lucide-react";
import { BugTicketSettings } from "@/components/admin/BugTicketSettings";
import {
  AuditSettings,
  type AuditEventDto,
} from "@/components/admin/AuditSettings";
import { useI18n } from "@/components/LocaleProvider";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import type { DataTableColumn } from "@/components/ui/DataTable/types";
import {
  BalanceDialog,
  ExpensePolicySettings,
  LeavePolicyDialog,
  OrganizationSettings,
} from "@/components/admin/AdminSettingsEditors";
import { HolidaySettings } from "@/components/admin/HolidaySettings";
import { TimeProjectSettings } from "@/components/admin/TimeProjectSettings";
import { ReferenceDataSettings } from "@/components/admin/ReferenceDataSettings";
import { AnnouncementEmailPreview } from "@/components/admin/AnnouncementEmailPreview";
import type {
  AccessPolicyDto as Policy,
  AdminPersonDto as Person,
  CompanyHolidayDto as CompanyHoliday,
  ExpensePolicyDto as ExpensePolicy,
  LeaveBalanceDto as Balance,
  LeaveTypeDto as LeaveType,
  OrgUnitDto as OrgUnit,
  ReportingPersonDto as ReportingPerson,
  ReferenceValueDto,
  TimeProjectDto as TimeProject,
} from "@/modules/admin/types";
import type { IntegrityCheck } from "@/modules/admin/integrity";

const permissionColumns = [
  ["managePeople", "Manage people"],
  ["viewSensitiveData", "Sensitive data"],
  ["approveLeave", "Approve leave"],
  ["approveTime", "Approve time"],
  ["approveExpenses", "Expenses"],
  ["viewAudit", "Audit log"],
  ["manageSettings", "Admin settings"],
  ["manageInventory", "Manage inventory"],
] as const;

export function AdminSettings({
  policies: initialPolicies,
  types: initialTypes,
  people: initialPeople,
  balances: initialBalances,
  expensePolicies: initialExpensePolicies,
  units: initialUnits,
  reporting: initialReporting,
  holidays,
  year,
  currentUserRole,
  canViewAudit,
  identity,
  auditEvents,
  projects,
  referenceValues,
  integrity,
  systemSettings,
}: {
  policies: Policy[];
  types: LeaveType[];
  people: Person[];
  balances: Balance[];
  expensePolicies: ExpensePolicy[];
  units: OrgUnit[];
  reporting: ReportingPerson[];
  holidays: CompanyHoliday[];
  year: number;
  currentUserRole: string;
  canViewAudit: boolean;
  identity: {
    mode: "demo" | "protected";
    provider: string;
    allowedEmailDomain: string;
    configured: boolean;
  };
  auditEvents: AuditEventDto[];
  projects: TimeProject[];
  referenceValues: ReferenceValueDto[];
  integrity: {
    checkedAt: string;
    healthy: boolean;
    checks: IntegrityCheck[];
  };
  systemSettings: Record<string, unknown>;
}) {
  const { t } = useI18n();
  const [policies, setPolicies] = useState(initialPolicies);
  const [types, setTypes] = useState(initialTypes);
  const [people, setPeople] = useState(initialPeople);
  const [balances, setBalances] = useState(initialBalances);
  const [expensePolicies, setExpensePolicies] = useState(
    initialExpensePolicies,
  );
  const [units, setUnits] = useState(initialUnits);
  const [reporting, setReporting] = useState(initialReporting);
  const [query, setQuery] = useState("");
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [editingBalance, setEditingBalance] = useState<Balance | null>(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">(
    "success",
  );
  const [activeSection, setActiveSection] = useState("overview");
  const isSuperAdmin = currentUserRole === "super_admin";

  function showMessage(text: string, kind: "success" | "error" = "success") {
    setMessageKind(kind);
    setMessage(text);
  }

  function handleChildMessage(text: string) {
    const localized = t(text);
    const isError =
      /^(Could not|Unable|Failed|Не вдалося|Помилка|Потрібен)/i.test(text);
    showMessage(localized, isError ? "error" : "success");
  }
  const defaults = systemSettings.employee_defaults as
    | {
        division: string;
        location: string;
        workMode: "office" | "remote";
        employmentType: string;
        timezone: string;
        workDays: string;
        startTime: string;
        endTime: string;
        breakMinutes: number;
        probationMonths?: number;
      }
    | undefined;

  useEffect(() => {
    const readHash = () => {
      const value = window.location.hash.replace(/^#settings-/, "");
      if (
        [
          "overview",
          "leave",
          "expenses",
          "organization",
          "reference-data",
          "access",
          "defaults",
          "projects",
          "bugs",
          "audit",
        ].includes(value)
      ) {
        setActiveSection(value);
      }
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  function openSection(section: string) {
    setActiveSection(section);
    window.history.replaceState(null, "", `#settings-${section}`);
  }

  const showSection = (section: string) => activeSection === section;

  // Search narrows the rows; it returns the table to page 1.
  const [balancePage, setBalancePage] = useState(1);
  const balanceColumns = useMemo<DataTableColumn<Balance>[]>(
    () => [
      {
        key: "employee",
        header: "Employee",
        minWidth: 170,
        sortValue: (balance) => `${balance.firstName} ${balance.lastName}`,
        cell: (balance) => (
          <span className="admin-balance-employee">
            <strong>
              {balance.firstName} {balance.lastName}
            </strong>
            <small>EMP-{String(balance.employeeId).padStart(3, "0")}</small>
          </span>
        ),
      },
      {
        key: "policy",
        header: "Policy",
        sortValue: (balance) => t(balance.typeName),
        cell: (balance) => (
          <span className="leave-type-cell">
            <i style={{ background: balance.color }} /> {t(balance.typeName)}
          </span>
        ),
      },
      {
        key: "allowance",
        header: "Allowance",
        minWidth: 80,
        sortValue: (balance) => balance.allowance,
        cell: (balance) => balance.allowance,
      },
      {
        key: "adjustment",
        header: "Adjustment",
        minWidth: 85,
        sortValue: (balance) => balance.adjustment,
        cell: (balance) =>
          `${balance.adjustment > 0 ? "+" : ""}${balance.adjustment}`,
      },
      {
        key: "used",
        header: "Used",
        minWidth: 65,
        sortValue: (balance) => balance.used,
        cell: (balance) => balance.used,
      },
      {
        key: "available",
        header: "Available",
        minWidth: 75,
        sortValue: (balance) =>
          balance.allowance + balance.adjustment - balance.used,
        cell: (balance) => (
          <strong>
            {balance.allowance + balance.adjustment - balance.used}
          </strong>
        ),
      },
    ],
    [t],
  );

  const visibleBalances = useMemo(() => {
    const term = query.toLowerCase().trim();
    // The table shows the translated policy name; match it and the stored one.
    return balances.filter(
      (item) =>
        !term ||
        `${item.firstName} ${item.lastName} ${t(item.typeName)} ${item.typeName}`
          .toLowerCase()
          .includes(term),
    );
  }, [balances, query, t]);

  async function savePolicy(policy: Policy) {
    setMessage("");
    setMessageKind("success");
    const response = await fetch(`/api/admin/access-policies/${policy.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(policy),
    });
    const result = (await response.json()) as {
      policy?: Policy;
      error?: string;
    };
    if (response.ok && result.policy) {
      setPolicies((items) =>
        items.map((item) => (item.id === policy.id ? result.policy! : item)),
      );
      showMessage(`${policy.label}: ${t("permissions saved.")}`);
    } else {
      showMessage(t(result.error ?? "Could not save permissions."), "error");
    }
  }

  async function changeRole(
    userId: number,
    role: string,
    manageProjects?: boolean,
  ) {
    const person = people.find((item) => item.userId === userId);
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role,
        manageProjects: manageProjects ?? person?.manageProjects ?? false,
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (response.ok) {
      setPeople((items) =>
        items.map((item) =>
          item.userId === userId
            ? {
                ...item,
                role,
                manageProjects: manageProjects ?? item.manageProjects,
              }
            : item,
        ),
      );
      showMessage(t("User access group updated."));
    } else {
      showMessage(t(result.error ?? "Could not update the user."), "error");
    }
  }

  return (
    <>
      <section className="page-heading-row settings-heading">
        <div>
          <p className="eyebrow">{t("Workspace administration")}</p>
          <h1>{t("Settings")}</h1>
          <p>
            {t(
              "Manage leave rules, individual balances, roles and data access.",
            )}
          </p>
        </div>
        {message && (
          <span
            className={`settings-toast ${messageKind === "error" ? "settings-toast-error" : ""}`}
            role={messageKind === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {messageKind === "error" ? (
              <AlertCircle size={14} aria-hidden="true" />
            ) : (
              <Check size={14} aria-hidden="true" />
            )}{" "}
            {message}
          </span>
        )}
      </section>
      <nav
        className="settings-section-index"
        aria-label={t("Settings sections")}
      >
        <a
          href="#settings-overview"
          aria-current={activeSection === "overview" ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            openSection("overview");
          }}
        >
          {t("Overview")}
        </a>
        <a
          href="#settings-leave"
          aria-current={activeSection === "leave" ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            openSection("leave");
          }}
        >
          {t("Leave policies")}
        </a>
        <a
          href="#settings-expenses"
          aria-current={activeSection === "expenses" ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            openSection("expenses");
          }}
        >
          {t("Reimbursements")}
        </a>
        <a
          href="#settings-organization"
          aria-current={activeSection === "organization" ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            openSection("organization");
          }}
        >
          {t("Organization")}
        </a>
        <a
          href="#settings-reference-data"
          aria-current={activeSection === "reference-data" ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            openSection("reference-data");
          }}
        >
          {t("Profile dictionaries")}
        </a>
        {isSuperAdmin && (
          <a
            href="#settings-access"
            aria-current={activeSection === "access" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              openSection("access");
            }}
          >
            {t("Roles & access")}
          </a>
        )}
        {currentUserRole === "super_admin" && (
          <a
            href="#settings-defaults"
            aria-current={activeSection === "defaults" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              openSection("defaults");
            }}
          >
            {t("Employee defaults")}
          </a>
        )}
        <a
          href="#settings-projects"
          aria-current={activeSection === "projects" ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            openSection("projects");
          }}
        >
          <Clock3 size={14} /> {t("Time projects")}
        </a>
        <a
          href="#settings-bugs"
          aria-current={activeSection === "bugs" ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            openSection("bugs");
          }}
        >
          <Bug size={14} /> {t("Bug tickets")}
        </a>
        {canViewAudit && (
          <a
            href="#settings-audit"
            aria-current={activeSection === "audit" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              openSection("audit");
            }}
          >
            <Activity size={14} /> {t("Audit log")}
          </a>
        )}
      </nav>

      {showSection("overview") && (
        <section className="settings-section" id="settings-overview">
          <SectionTitle title={t("Overview")} />
          <>
            <section className="settings-grid">
              <Summary
                icon={<Database />}
                label={t("Database")}
                value="Cloudflare D1"
                note={t("Connected")}
                href="/api/admin/backup"
              />
              <Summary
                icon={<CalendarRange />}
                label={t("Leave policies")}
                value={`${types.length} ${t("active types")}`}
                note={`${balances.length} ${t("balances")}`}
                onClick={() => openSection("leave")}
              />
              <Summary
                icon={<Users />}
                label={t("User accounts")}
                value={`${people.length} ${t("mapped users")}`}
                note={`${policies.length} ${t("access groups")}`}
                onClick={isSuperAdmin ? () => openSection("access") : undefined}
              />
              <Summary
                icon={<ShieldCheck />}
                label={t("Google SSO")}
                value={
                  identity.mode === "protected"
                    ? identity.configured
                      ? t("Active")
                      : t("Configuration required")
                    : t("Ready to activate")
                }
                note={
                  identity.allowedEmailDomain === "*"
                    ? t("Any verified Google account")
                    : `${t("Only")} @${identity.allowedEmailDomain}`
                }
                onClick={isSuperAdmin ? () => openSection("access") : undefined}
              />
              <Summary
                icon={<ReceiptText />}
                label={t("Reimbursements")}
                value={`${expensePolicies.length} ${t("active policy")}`}
                note={t("Limits are editable")}
                onClick={() => openSection("expenses")}
              />
              <Summary
                icon={<Network />}
                label={t("Organization")}
                value={`${units.length} ${t("units")}`}
                note={`${reporting.length} ${t("reporting lines")}`}
                onClick={() => openSection("organization")}
              />
              <Summary
                icon={<ShieldCheck />}
                label={t("Data integrity")}
                value={
                  integrity.healthy ? t("Healthy") : t("Attention required")
                }
                note={`${integrity.checks.reduce((sum, item) => sum + item.count, 0)} ${t("integrity issues")}`}
                onClick={() =>
                  document
                    .getElementById("settings-integrity")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              />
              <Link
                className="panel setting-card setting-card-link"
                href="/inventory"
              >
                <PackageSearch />
                <div>
                  <small>{t("Office inventory")}</small>
                  <strong>{t("Equipment and merchandise")}</strong>
                </div>
                <span className="status-badge active">{t("Open")}</span>
              </Link>
            </section>
            {isSuperAdmin && identity.mode === "protected" && (
              <AnnouncementEmailPreview />
            )}
            <article className="panel admin-help">
              <KeyRound size={19} />
              <div>
                <strong>
                  {t("No access rules are hidden in the UI anymore.")}
                </strong>
                <p>
                  {t(
                    "The role matrix below is enforced by employee editing, private profile fields, Leave approvals, Time approvals, audit access and this admin area.",
                  )}
                </p>
              </div>
              <div className="admin-help-actions">
                <Link className="button ghost-button" href="/api/admin/backup">
                  <Download size={15} /> {t("Export backup")}
                </Link>
                <a
                  className="button primary-button"
                  href="#settings-access"
                  onClick={(event) => {
                    event.preventDefault();
                    openSection("access");
                  }}
                >
                  {t("Review access")}
                </a>
              </div>
            </article>
            <article className="panel data-panel" id="settings-integrity">
              <div className="data-panel-heading">
                <div>
                  <h2>{t("Data integrity")}</h2>
                  <span data-label={t("Employee")}>
                    {t("Automatic checks across all persistent modules")}
                  </span>
                </div>
                <span
                  className={`status-badge ${integrity.healthy ? "active" : "warning"}`}
                >
                  {integrity.healthy ? t("Healthy") : t("Attention required")}
                </span>
              </div>
              <div className="integrity-check-list">
                {integrity.checks.map((check) => (
                  <div key={check.key}>
                    <span>{t(check.label)}</span>
                    <strong>{check.count}</strong>
                  </div>
                ))}
              </div>
            </article>
          </>
        </section>
      )}

      {showSection("defaults") &&
        currentUserRole === "super_admin" &&
        defaults && (
          <section className="settings-section" id="settings-defaults">
            <SectionTitle title={t("Employee defaults")} />
            <SystemDefaultsSettings
              initialValue={{
                ...defaults,
                probationMonths: defaults.probationMonths ?? 3,
              }}
              divisions={units
                .filter((unit) => unit.type === "division" && unit.active)
                .map((unit) => unit.name)}
              employmentTypes={referenceValues
                .filter(
                  (item) => item.kind === "employment_type" && item.active,
                )
                .map((item) => item.label)}
              onMessage={handleChildMessage}
            />
          </section>
        )}

      {showSection("expenses") && (
        <section className="settings-section" id="settings-expenses">
          <SectionTitle title={t("Reimbursements")} />
          <ExpensePolicySettings
            policies={expensePolicies}
            onSaved={(policy) => {
              setExpensePolicies((items) =>
                items.map((item) => (item.id === policy.id ? policy : item)),
              );
              showMessage(t("Reimbursement policy updated."));
            }}
          />
        </section>
      )}

      {showSection("organization") && (
        <section className="settings-section" id="settings-organization">
          <SectionTitle title={t("Organization")} />
          <OrganizationSettings
            units={units}
            people={reporting}
            onUnitsChange={setUnits}
            onPeopleChange={setReporting}
            onMessage={handleChildMessage}
          />
        </section>
      )}

      {showSection("reference-data") && (
        <section className="settings-section" id="settings-reference-data">
          <SectionTitle title={t("Profile dictionaries")} />
          <ReferenceDataSettings initialValues={referenceValues} />
        </section>
      )}

      {showSection("bugs") && (
        <section className="settings-section" id="settings-bugs">
          <SectionTitle title={t("Bug tickets")} />
          <BugTicketSettings />
        </section>
      )}

      {showSection("projects") && (
        <section className="settings-section" id="settings-projects">
          <SectionTitle title={t("Time projects")} />
          <TimeProjectSettings
            projects={projects}
            onMessage={handleChildMessage}
          />
        </section>
      )}

      {showSection("audit") && canViewAudit && (
        <section className="settings-section" id="settings-audit">
          <SectionTitle title={t("Audit log")} />
          <AuditSettings events={auditEvents} />
        </section>
      )}

      {showSection("leave") && (
        <section className="settings-section" id="settings-leave">
          <SectionTitle title={t("Leave policies")} />
          <>
            <section className="leave-policy-grid">
              {types.map((type) => (
                <article className="panel leave-policy-card" key={type.id}>
                  <i style={{ background: type.color }} />
                  <div>
                    <span>{type.code}</span>
                    <h2>{t(type.name)}</h2>
                    <p>
                      {type.defaultAllowance} {t("days by default")} ·{" "}
                      {type.requiresApproval
                        ? t("approval required")
                        : t("automatic approval")}
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => setEditingType(type)}
                    aria-label={`${t("Edit")} ${t(type.name)}`}
                  >
                    <Pencil size={15} />
                  </button>
                </article>
              ))}
            </section>
            <section className="panel data-panel">
              <div className="data-panel-heading">
                <div>
                  <h2>
                    {t("Employee balances")} · {year}
                  </h2>
                  <span>{t("Allowance + adjustment − used = available")}</span>
                </div>
                <label className="admin-table-search">
                  <Search size={14} />
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setBalancePage(1);
                    }}
                    placeholder={t("Search employee or policy")}
                  />
                </label>
              </div>
              <DataTable
                rows={visibleBalances}
                sizeRows={balances}
                rowKey={(balance) => balance.id}
                columns={balanceColumns}
                ariaLabel={t("Employee balances")}
                page={balancePage}
                onPageChange={setBalancePage}
                empty={
                  query.trim()
                    ? { icon: Search, text: t("No matching balances.") }
                    : { icon: CalendarRange, text: t("No balances yet.") }
                }
                rowActions={(balance) => [
                  {
                    icon: Pencil,
                    label: `${t("Edit")} ${balance.firstName} ${balance.lastName} ${t(balance.typeName)}`,
                    onClick: () => setEditingBalance(balance),
                  },
                ]}
              />
            </section>
            <HolidaySettings
              holidays={holidays}
              onMessage={handleChildMessage}
            />
          </>
        </section>
      )}

      {showSection("access") && (
        <section className="settings-section" id="settings-access">
          <SectionTitle title={t("Roles & access")} />
          {isSuperAdmin ? (
            <>
              <section className="panel access-matrix">
                <div className="data-panel-heading">
                  <div>
                    <h2>{t("Access matrix")}</h2>
                    <span>{t("Permissions granted to each user group")}</span>
                  </div>
                </div>
                <div className="access-matrix-scroll">
                  <div className="access-matrix-head">
                    <span>{t("Group")}</span>
                    {permissionColumns.map(([, label]) => (
                      <span key={label}>{t(label)}</span>
                    ))}
                    <span />
                  </div>
                  {policies.map((policy) => (
                    <div className="access-matrix-row" key={policy.id}>
                      <span>
                        <strong>{policy.label}</strong>
                        <small>{policy.role}</small>
                      </span>
                      {permissionColumns.map(([key, label]) => (
                        <label
                          className="permission-check"
                          data-label={t(label)}
                          key={key}
                        >
                          <input
                            type="checkbox"
                            checked={policy[key]}
                            disabled={
                              policy.role === "super_admin" ||
                              (policy.role === "hr_admin" &&
                                key === "manageSettings") ||
                              (key === "manageInventory" &&
                                policy.role !== "hr_admin")
                            }
                            onChange={(event) =>
                              setPolicies((items) =>
                                items.map((item) =>
                                  item.id === policy.id
                                    ? { ...item, [key]: event.target.checked }
                                    : item,
                                ),
                              )
                            }
                          />
                          <span>
                            <Check size={12} />
                          </span>
                        </label>
                      ))}
                      <button
                        className="button ghost-button"
                        disabled={policy.role === "super_admin"}
                        onClick={() => savePolicy(policy)}
                        aria-label={`${t("Save")} ${policy.label}`}
                      >
                        {policy.role === "super_admin"
                          ? t("Protected")
                          : t("Save")}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel data-panel">
                <div className="data-panel-heading">
                  <div>
                    <h2>{t("User access groups")}</h2>
                    <span>
                      {t("Assign a role to each mapped employee account")}
                    </span>
                  </div>
                </div>
                <div className="user-role-list">
                  {people.map((person) => (
                    <div key={person.userId}>
                      <span className="employee-person-cell">
                        <span className="avatar small">
                          {person.firstName?.[0] ?? "?"}
                          {person.lastName?.[0] ?? ""}
                        </span>
                        <span>
                          <strong>
                            {person.firstName && person.lastName
                              ? `${person.firstName} ${person.lastName}`
                              : person.email}
                          </strong>
                          <small>
                            {person.firstName
                              ? `${person.email} · ${person.jobTitle}`
                              : t(
                                  "SSO account · not linked to an employee profile",
                                )}
                          </small>
                        </span>
                      </span>
                      <select
                        value={person.role}
                        aria-label={`${t("Role for")} ${person.firstName && person.lastName ? `${person.firstName} ${person.lastName}` : person.email}`}
                        disabled={
                          person.role === "super_admin" &&
                          currentUserRole !== "super_admin"
                        }
                        onChange={(event) =>
                          changeRole(person.userId, event.target.value)
                        }
                      >
                        <option value="employee">{t("Employee")}</option>
                        <option value="manager">{t("Manager")}</option>
                        <option value="hr_admin">
                          {t("HR administrator")}
                        </option>
                        <option value="super_admin">
                          {t("Super administrator")}
                        </option>
                      </select>
                      <label className="project-access-toggle">
                        <input
                          type="checkbox"
                          checked={person.manageProjects}
                          aria-label={`${t("Project manager access for")} ${person.firstName && person.lastName ? `${person.firstName} ${person.lastName}` : person.email}`}
                          onChange={(event) =>
                            changeRole(
                              person.userId,
                              person.role,
                              event.target.checked,
                            )
                          }
                        />
                        <span>
                          <Check size={12} />
                        </span>
                        {t("Project manager access")}
                      </label>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="panel data-panel access-readonly" role="note">
              <h2>{t("Roles & access")}</h2>
              <p>
                {t(
                  "Only super administrators can change roles, permissions or project access.",
                )}
              </p>
            </section>
          )}
        </section>
      )}

      {editingType && (
        <LeavePolicyDialog
          policy={editingType}
          year={year}
          onClose={() => setEditingType(null)}
          onSaved={(policy) => {
            setTypes((items) =>
              items.map((item) => (item.id === policy.id ? policy : item)),
            );
            setEditingType(null);
            showMessage(t("Leave policy updated."));
          }}
        />
      )}
      {editingBalance && (
        <BalanceDialog
          balance={editingBalance}
          onClose={() => setEditingBalance(null)}
          onSaved={(balance) => {
            setBalances((items) =>
              items.map((item) =>
                item.id === balance.id ? { ...item, ...balance } : item,
              ),
            );
            setEditingBalance(null);
            showMessage(t("Employee balance updated."));
          }}
        />
      )}
    </>
  );
}

function SystemDefaultsSettings({
  initialValue,
  divisions,
  employmentTypes,
  onMessage,
}: {
  initialValue: {
    division: string;
    location: string;
    workMode: "office" | "remote";
    employmentType: string;
    timezone: string;
    workDays: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    probationMonths: number;
  };
  divisions: string[];
  employmentTypes: string[];
  onMessage: (message: string) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/admin/system-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "employee_defaults", value }),
    });
    const result = (await response.json()) as { error?: string };
    onMessage(
      response.ok
        ? t("Employee defaults saved.")
        : (result.error ?? t("Could not save defaults.")),
    );
    setSaving(false);
  }
  return (
    <form className="panel form-grid policy-form" onSubmit={submit}>
      <label>
        {t("Division")}
        <select
          value={value.division}
          onChange={(event) =>
            setValue({ ...value, division: event.target.value })
          }
        >
          {divisions.map((division) => (
            <option key={division}>{division}</option>
          ))}
        </select>
      </label>
      <label>
        {t("Location")}
        <input
          value={value.location}
          onChange={(event) =>
            setValue({ ...value, location: event.target.value })
          }
          required
        />
      </label>
      <label>
        {t("Employment type")}
        <select
          value={value.employmentType}
          onChange={(event) =>
            setValue({ ...value, employmentType: event.target.value })
          }
        >
          {employmentTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      <label>
        {t("Timezone")}
        <input
          value={value.timezone}
          onChange={(event) =>
            setValue({ ...value, timezone: event.target.value })
          }
          required
        />
      </label>
      <label>
        {t("Work days")}
        <input
          value={value.workDays}
          onChange={(event) =>
            setValue({ ...value, workDays: event.target.value })
          }
          required
        />
      </label>
      <label>
        {t("Default work mode")}
        <select
          value={value.workMode}
          onChange={(event) =>
            setValue({
              ...value,
              workMode: event.target.value as "office" | "remote",
            })
          }
        >
          <option value="office">{t("Office")}</option>
          <option value="remote">{t("Remote")}</option>
        </select>
      </label>
      <label>
        {t("Start time")}
        <input
          type="time"
          value={value.startTime}
          onChange={(event) =>
            setValue({ ...value, startTime: event.target.value })
          }
          required
        />
      </label>
      <label>
        {t("End time")}
        <input
          type="time"
          value={value.endTime}
          onChange={(event) =>
            setValue({ ...value, endTime: event.target.value })
          }
          required
        />
      </label>
      <label>
        {t("Break minutes")}
        <input
          type="number"
          min="0"
          max="240"
          value={value.breakMinutes}
          onChange={(event) =>
            setValue({ ...value, breakMinutes: Number(event.target.value) })
          }
          required
        />
      </label>
      <label>
        {t("Probation period (months)")}
        <input
          type="number"
          min="0"
          max="24"
          value={value.probationMonths ?? 3}
          onChange={(event) =>
            setValue({ ...value, probationMonths: Number(event.target.value) })
          }
          required
        />
      </label>
      <div className="dialog-actions span-two">
        <button className="button primary-button" disabled={saving}>
          {saving ? t("Saving…") : t("Save defaults")}
        </button>
      </div>
    </form>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="settings-section-title">{title}</h2>;
}

function Summary({
  icon,
  label,
  value,
  note,
  href,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  href?: string;
  onClick?: () => void;
}) {
  const contents = (
    <>
      {icon}
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
      <span className="status-badge active">{note}</span>
    </>
  );
  if (href)
    return (
      <Link className="panel setting-card setting-card-link" href={href}>
        {contents}
      </Link>
    );
  if (onClick)
    return (
      <button
        type="button"
        className="panel setting-card setting-card-link"
        onClick={onClick}
        aria-label={`${label}: ${value}. ${note}`}
      >
        {contents}
      </button>
    );
  return <article className="panel setting-card">{contents}</article>;
}
