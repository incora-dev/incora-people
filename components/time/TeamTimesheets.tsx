"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  LockKeyhole,
  Search,
  UnlockKeyhole,
  Users,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import type { TeamTimesheetRowDto } from "@/modules/time/types";

export function TeamTimesheets({
  initialRows,
  month,
}: {
  initialRows: TeamTimesheetRowDto[];
  month: string;
}) {
  const { locale, t } = useI18n();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        !term ||
        `${row.firstName} ${row.lastName} ${row.department} ${row.team ?? ""}`
          .toLowerCase()
          .includes(term),
    );
  }, [query, rows]);
  const locked = rows.filter((row) => row.status === "locked").length;
  const attention = rows.filter(
    (row) =>
      row.openEntries > 0 || row.pendingCorrections > 0 || row.longEntries > 0,
  ).length;
  const tracked = rows.reduce((sum, row) => sum + row.workedMinutes, 0);

  async function changeStatus(
    row: TeamTimesheetRowDto,
    nextStatus?: TeamTimesheetRowDto["status"],
  ) {
    const status = nextStatus ?? (row.status === "locked" ? "open" : "locked");
    const note =
      status === "revision_required"
        ? (window.prompt(t("Add a comment for the employee")) ?? "")
        : "";
    if (status === "revision_required" && !note.trim()) return;
    setBusyId(row.employeeId);
    setMessage("");
    const response = await fetch(`/api/time/periods/${row.employeeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ month, status, note }),
    });
    const result = (await response.json()) as {
      error?: string;
      period?: {
        status: TeamTimesheetRowDto["status"];
        lockedAt: string | null;
        lockedByEmail: string | null;
      };
    };
    if (response.ok && result.period) {
      setRows((items) =>
        items.map((item) =>
          item.employeeId === row.employeeId
            ? {
                ...item,
                status: result.period!.status,
                lockedAt: result.period!.lockedAt,
                lockedByEmail: result.period!.lockedByEmail,
              }
            : item,
        ),
      );
      setMessage(
        status === "locked"
          ? `${row.firstName}: ${t("timesheet locked.")}`
          : `${row.firstName}: ${t("timesheet reopened.")}`,
      );
    } else {
      setMessage(result.error ?? "Could not update the timesheet period.");
    }
    setBusyId(null);
  }

  return (
    <>
      <section className="page-heading-row">
        <div>
          <p className="eyebrow">{t("Time management")}</p>
          <h1>{t("Team timesheets")}</h1>
          <p>
            {t("Review monthly totals and close completed payroll periods.")}
          </p>
        </div>
        <div className="page-actions">
          <Link className="button ghost-button" href="/time">
            <ArrowLeft size={15} /> {t("My time")}
          </Link>
          <form className="timesheet-month-form">
            <input
              name="month"
              type="month"
              defaultValue={month}
              aria-label={t("Timesheet month")}
            />
            <button className="button primary-button">{t("Open month")}</button>
          </form>
          <a
            className="button ghost-button"
            href={`/api/time/team-export?month=${month}`}
          >
            <Download size={15} /> {t("Export")}
          </a>
        </div>
      </section>

      {message && (
        <div className="settings-toast timesheet-toast">
          <Check size={14} /> {message}
        </div>
      )}

      <section className="task-summary-grid timesheet-summary-grid">
        <Summary
          icon={<Users />}
          value={String(rows.length)}
          label={t("People in scope")}
        />
        <Summary
          icon={<Clock3 />}
          value={formatMinutes(tracked, t)}
          label={t("Tracked time")}
        />
        <Summary
          icon={<LockKeyhole />}
          value={`${locked} / ${rows.length}`}
          label={t("Locked sheets")}
        />
        <Summary
          icon={<AlertTriangle />}
          value={String(attention)}
          label={t("Need attention")}
        />
      </section>

      <section className="panel data-panel">
        <div className="data-panel-heading">
          <div>
            <h2>{formatMonth(month, locale)}</h2>
            <span>
              {t("Locking prevents entries and corrections in this month.")}
            </span>
          </div>
          <label className="admin-table-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search person or team")}
            />
          </label>
        </div>
        <div className="team-timesheet-table">
          <div className="team-timesheet-head">
            <span>{t("Person")}</span>
            <span>{t("Entries")}</span>
            <span>{t("Time")}</span>
            <span>{t("Overtime")}</span>
            <span>{t("Checks")}</span>
            <span>{t("Status")}</span>
            <span />
          </div>
          {filtered.map((row) => (
            <div className="team-timesheet-row" key={row.employeeId}>
              <Link
                className="employee-person-cell"
                href={`/employees/${row.employeeId}`}
              >
                <span className="avatar small">
                  {row.firstName[0]}
                  {row.lastName[0]}
                </span>
                <span>
                  <strong>
                    {row.firstName} {row.lastName}
                  </strong>
                  <small>
                    {row.department}
                    {row.team ? ` · ${row.team}` : ""}
                  </small>
                </span>
              </Link>
              <span>{row.entryCount}</span>
              <span>
                <strong>{formatMinutes(row.workedMinutes, t)}</strong>
                <small>
                  {t("Expected")} {formatMinutes(row.expectedMinutes, t)}
                </small>
              </span>
              <span
                className={
                  row.overtimeMinutes ? "timesheet-warning" : "timesheet-ready"
                }
              >
                {row.overtimeMinutes
                  ? `+${formatMinutes(row.overtimeMinutes, t)}`
                  : "—"}
              </span>
              <span>
                {row.openEntries > 0 ||
                row.pendingCorrections > 0 ||
                row.longEntries > 0 ? (
                  <span className="timesheet-warning">
                    <AlertTriangle size={13} />
                    {row.longEntries > 0
                      ? `${row.longEntries} ${t("long shift")}`
                      : row.openEntries > 0
                        ? `${row.openEntries} ${t("running")}`
                        : `${row.pendingCorrections} ${t("correction")}`}
                  </span>
                ) : (
                  <span className="timesheet-ready">
                    <Check size={13} /> {t("Ready")}
                  </span>
                )}
              </span>
              <span className={`status-badge ${row.status}`}>
                {t(row.status)}
              </span>
              <button
                className={
                  row.status === "locked" || row.status === "approved"
                    ? "button ghost-button"
                    : "button primary-button"
                }
                onClick={() => changeStatus(row)}
                disabled={busyId === row.employeeId}
              >
                {row.status === "locked" || row.status === "approved" ? (
                  <UnlockKeyhole size={14} />
                ) : (
                  <LockKeyhole size={14} />
                )}
                {busyId === row.employeeId
                  ? t("Saving…")
                  : row.status === "locked" || row.status === "approved"
                    ? t("Reopen")
                    : t("Lock")}
              </button>
              {row.status !== "approved" && (
                <button
                  className="button ghost-button"
                  onClick={() => changeStatus(row, "approved")}
                  disabled={busyId === row.employeeId}
                >
                  <CheckCircle2 size={14} />
                  {t("Approve")}
                </button>
              )}
              {row.status !== "revision_required" && (
                <button
                  className="button ghost-button"
                  onClick={() => changeStatus(row, "revision_required")}
                  disabled={busyId === row.employeeId}
                >
                  {t("Return")}
                </button>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="compact-empty">{t("No people match this view.")}</p>
          )}
        </div>
      </section>
    </>
  );
}

function Summary({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <article className="panel">
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

function formatMinutes(minutes: number, t: (key: string) => string) {
  return `${Math.floor(minutes / 60)} ${t("h")} ${minutes % 60} ${t("m")}`;
}

function formatMonth(month: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}
