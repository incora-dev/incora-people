"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  CornerUpLeft,
  Download,
  LockKeyhole,
  Search,
  UnlockKeyhole,
  Users,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import type {
  DataTableColumn,
  DataTableRowAction,
} from "@/components/ui/DataTable/types";
import type { TeamTimesheetRowDto } from "@/modules/time/types";

type Row = TeamTimesheetRowDto;

function needsAttention(row: Row) {
  return (
    row.openEntries > 0 || row.pendingCorrections > 0 || row.longEntries > 0
  );
}

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
  // Blocks a second click that lands before the re-render.
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  // Search narrows the rows; it returns the table to page 1.
  const [page, setPage] = useState(1);
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
  const attention = rows.filter(needsAttention).length;
  const tracked = rows.reduce((sum, row) => sum + row.workedMinutes, 0);

  async function changeStatus(
    row: TeamTimesheetRowDto,
    nextStatus?: TeamTimesheetRowDto["status"],
  ) {
    if (busyRef.current) return;
    // Locked and approved sheets are both closed: the toggle reopens them.
    const status =
      nextStatus ??
      (row.status === "locked" || row.status === "approved"
        ? "open"
        : "locked");
    const note =
      status === "revision_required"
        ? (window.prompt(t("Add a comment for the employee")) ?? "")
        : "";
    if (status === "revision_required" && !note.trim()) return;
    busyRef.current = true;
    setBusyId(row.employeeId);
    setMessage("");
    let ok = false;
    let result: {
      error?: string;
      period?: {
        status: TeamTimesheetRowDto["status"];
        lockedAt: string | null;
        lockedByEmail: string | null;
      };
    } = {};
    try {
      const response = await fetch(`/api/time/periods/${row.employeeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month, status, note }),
      });
      ok = response.ok;
      result = (await response.json().catch(() => ({}))) as typeof result;
    } catch {
      ok = false;
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
    if (ok && result.period) {
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
      const done = {
        locked: "timesheet locked.",
        approved: "timesheet approved.",
        revision_required: "timesheet returned for revision.",
        open: "timesheet reopened.",
      }[status];
      setMessage(`${row.firstName}: ${t(done)}`);
    } else {
      setMessage(result.error ?? t("Could not update the timesheet period."));
    }
  }

  const columns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        key: "person",
        header: "Person",
        minWidth: 230,
        sortValue: (row) => `${row.firstName} ${row.lastName}`,
        cell: (row) => (
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
        ),
      },
      {
        key: "entries",
        header: "Entries",
        minWidth: 70,
        sortValue: (row) => row.entryCount,
        cell: (row) => row.entryCount,
      },
      {
        key: "time",
        header: "Time",
        sortValue: (row) => row.workedMinutes,
        cell: (row) => (
          <span className="team-timesheet-time">
            <strong>{formatMinutes(row.workedMinutes, t)}</strong>
            <small>
              {t("Expected")} {formatMinutes(row.expectedMinutes, t)}
            </small>
          </span>
        ),
      },
      {
        key: "overtime",
        header: "Overtime",
        minWidth: 90,
        // No overtime sorts last.
        sortValue: (row) => row.overtimeMinutes || null,
        cell: (row) => (
          <span
            className={
              row.overtimeMinutes ? "timesheet-warning" : "timesheet-ready"
            }
          >
            {row.overtimeMinutes
              ? `+${formatMinutes(row.overtimeMinutes, t)}`
              : "—"}
          </span>
        ),
      },
      {
        key: "checks",
        header: "Checks",
        // Rows that need attention sort first.
        sortValue: (row) => (needsAttention(row) ? 0 : 1),
        cell: (row) =>
          needsAttention(row) ? (
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
          ),
      },
      {
        key: "status",
        header: "Status",
        minWidth: 80,
        sortValue: (row) => t(row.status),
        cell: (row) => (
          <span className={`status-badge ${row.status}`}>{t(row.status)}</span>
        ),
      },
    ],
    [t],
  );

  function rowActions(row: Row): DataTableRowAction[] {
    const busy = busyId !== null;
    const closed = row.status === "locked" || row.status === "approved";
    const actions: DataTableRowAction[] = [
      {
        icon: closed ? UnlockKeyhole : LockKeyhole,
        label: closed ? t("Reopen timesheet") : t("Lock timesheet"),
        disabled: busy,
        onClick: () => changeStatus(row),
      },
    ];
    if (row.status !== "approved")
      actions.push({
        icon: CheckCircle2,
        label: t("Approve timesheet"),
        disabled: busy,
        onClick: () => changeStatus(row, "approved"),
      });
    if (row.status !== "revision_required")
      actions.push({
        icon: CornerUpLeft,
        label: t("Return for revision"),
        disabled: busy,
        onClick: () => changeStatus(row, "revision_required"),
      });
    return actions;
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

      <section className="panel data-panel team-timesheet-panel">
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
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={t("Search person or team")}
            />
          </label>
        </div>
        <DataTable
          rows={filtered}
          sizeRows={rows}
          rowKey={(row) => row.employeeId}
          columns={columns}
          ariaLabel={t("Team timesheets")}
          page={page}
          onPageChange={setPage}
          empty={{ icon: Users, text: t("No people match this view.") }}
          rowActions={rowActions}
          rowClassName={(row) =>
            row.employeeId === busyId ? "data-table-row-busy" : undefined
          }
        />
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
