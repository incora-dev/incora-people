"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  Palmtree,
  Plus,
  Stethoscope,
  Undo2,
  WalletCards,
  X,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import type { DataTableColumn } from "@/components/ui/DataTable/types";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { DateField } from "@/components/ui/DateField";
import { formatCount } from "@/lib/i18n";

type Balance = {
  id: number;
  leaveTypeId: number;
  code: string;
  name: string;
  color: string;
  allowance: number;
  used: number;
  adjustment: number;
};

type LeaveRequest = {
  id: number;
  employeeId: number;
  leaveTypeId: number;
  typeName: string;
  typeCode: string;
  color: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  reviewerEmail: string | null;
  createdAt: string;
};

type PendingLeave = {
  id: number;
  employeeId: number;
  employeeFirstName: string;
  employeeLastName: string;
  managerId: number | null;
  typeName: string;
  color: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
};

export function LeaveWorkspace({
  balances,
  requests,
  pending,
  holidays,
  workDays,
  canApprove,
  readOnlyPreview = false,
}: {
  balances: Balance[];
  requests: LeaveRequest[];
  pending: PendingLeave[];
  holidays: { date: string; name: string }[];
  workDays: string;
  canApprove: boolean;
  readOnlyPreview?: boolean;
}) {
  const { locale, t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestRows, setRequestRows] = useState(requests);
  const [approvalRows, setApprovalRows] = useState(pending);
  const [reviewBusyId, setReviewBusyId] = useState<number | null>(null);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");

  async function review(id: number, action: "approved" | "rejected") {
    setReviewBusyId(id);
    setReviewMessage("");
    setReviewError("");
    try {
      const response = await fetch(`/api/leave/requests/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setReviewError(t(result.error ?? "Could not update leave request."));
        return;
      }
      setApprovalRows((items) => items.filter((item) => item.id !== id));
      setReviewMessage(
        action === "approved"
          ? t("Leave request approved.")
          : t("Leave request rejected."),
      );
    } catch {
      setReviewError(t("Could not update leave request."));
    } finally {
      setReviewBusyId(null);
    }
  }

  async function withdraw(id: number) {
    const response = await fetch(`/api/leave/requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "withdrawn" }),
    });
    if (response.ok) {
      setRequestRows((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: "withdrawn" } : item,
        ),
      );
    }
  }

  const requestColumns = useMemo<DataTableColumn<LeaveRequest>[]>(
    () => [
      {
        key: "type",
        header: "Type",
        sortValue: (item) => t(item.typeName),
        cell: (item) => (
          <span className="leave-type-cell">
            <i style={{ background: item.color }} /> {t(item.typeName)}
          </span>
        ),
      },
      {
        key: "dates",
        header: "Dates",
        minWidth: 150,
        // ISO start dates sort in calendar order.
        sortValue: (item) => item.startDate,
        cell: (item) => formatDateRange(item.startDate, item.endDate, locale),
      },
      {
        key: "days",
        header: "Days",
        minWidth: 70,
        sortValue: (item) => item.days,
        cell: (item) => item.days,
      },
      {
        key: "status",
        header: "Status",
        sortValue: (item) => t(item.status.replace("_", " ")),
        cell: (item) => <Status value={item.status} />,
      },
    ],
    [locale, t],
  );

  return (
    <div className="leave-workspace">
      <section className="page-heading-row">
        <div>
          <h1>{t("Leave")}</h1>
          <p>{t("Balances, requests and manager approvals.")}</p>
        </div>
        <div className="page-actions">
          <Link className="button ghost-button" href="/calendar">
            <CalendarDays size={16} /> {t("Team calendar")}
          </Link>
          {!readOnlyPreview && (
            <button
              className="button primary-button"
              onClick={() => setDialogOpen(true)}
            >
              <Plus size={16} /> {t("Request leave")}
            </button>
          )}
        </div>
      </section>

      <section className="leave-balance-grid" id="balances">
        {balances.map((balance) => {
          const available =
            balance.allowance + balance.adjustment - balance.used;
          const Icon =
            balance.code === "vacation"
              ? Palmtree
              : balance.code === "sick"
                ? Stethoscope
                : WalletCards;
          return (
            <article className="leave-balance-card panel" key={balance.id}>
              <span
                className="leave-type-icon"
                style={{
                  backgroundColor: `${balance.color}18`,
                  color: balance.color,
                }}
              >
                <Icon size={19} />
              </span>
              <div>
                <span>{t(balance.name)}</span>
                <strong>
                  {available.toFixed(1)} <small>{t("days available")}</small>
                </strong>
              </div>
              {!readOnlyPreview && (
                <button
                  className="mini-calendar-button"
                  onClick={() => setDialogOpen(true)}
                  aria-label={`${t("Request leave")}: ${t(balance.name)}`}
                >
                  <CalendarDays size={15} />
                </button>
              )}
            </article>
          );
        })}
      </section>

      <section className="panel data-panel" id="requests">
        <div className="data-panel-heading">
          <div>
            <h2>{t("My requests")}</h2>
            <span>
              {formatCount(
                locale,
                requestRows.length,
                { one: "запис", few: "записи", many: "записів" },
                { one: "record", many: "records" },
              )}
            </span>
          </div>
          {!readOnlyPreview && (
            <a className="compact-control" href="/api/leave/export">
              <Download size={15} /> {t("Export")}
            </a>
          )}
        </div>
        <DataTable
          rows={requestRows}
          rowKey={(item) => item.id}
          columns={requestColumns}
          ariaLabel={t("My requests")}
          defaultSort={{ key: "dates", direction: "desc" }}
          empty={{ icon: CalendarDays, text: t("No leave requests yet.") }}
          rowActions={(item) =>
            !readOnlyPreview && ["pending", "approved"].includes(item.status)
              ? [
                  {
                    icon: Undo2,
                    label: t("Withdraw"),
                    danger: true,
                    onClick: () => withdraw(item.id),
                  },
                ]
              : []
          }
        />
      </section>

      {canApprove && (
        <section className="panel data-panel" id="approvals">
          <div className="data-panel-heading">
            <div>
              <h2>{t("Needs your approval")}</h2>
              <span>{t("Direct reports and HR scope")}</span>
            </div>
            <span className="count-pill">{approvalRows.length}</span>
          </div>
          {reviewMessage && (
            <p className="form-message success" role="status">
              {reviewMessage}
            </p>
          )}
          {reviewError && (
            <p className="form-message error" role="alert">
              {reviewError}
            </p>
          )}
          {approvalRows.length === 0 ? (
            <div className="compact-empty">
              <Check size={18} /> {t("You’re all caught up.")}
            </div>
          ) : (
            <div className="approval-list compact-approvals">
              {approvalRows.map((item) => (
                <div className="approval-row" key={item.id}>
                  <span className="employee-person-cell">
                    <span className="avatar small">
                      {item.employeeFirstName[0]}
                      {item.employeeLastName[0]}
                    </span>
                    <span>
                      <strong>
                        {item.employeeFirstName} {item.employeeLastName}
                      </strong>
                      <small>
                        {t(item.typeName)} ·{" "}
                        {formatCount(
                          locale,
                          item.days,
                          { one: "день", few: "дні", many: "днів" },
                          { one: "day", many: "days" },
                        )}
                      </small>
                    </span>
                  </span>
                  <span className="approval-time">
                    {formatDateRange(item.startDate, item.endDate, locale)}
                  </span>
                  <span className="approval-actions">
                    <button
                      type="button"
                      onClick={() => review(item.id, "rejected")}
                      aria-label={`${t("Reject leave request")} ${item.employeeFirstName} ${item.employeeLastName} — ${t(item.typeName)}`}
                      title={t("Reject leave request")}
                      disabled={reviewBusyId !== null}
                      aria-busy={reviewBusyId === item.id}
                    >
                      <X size={15} />
                    </button>
                    <button
                      type="button"
                      className="approve"
                      onClick={() => review(item.id, "approved")}
                      aria-label={`${t("Approve leave request")} ${item.employeeFirstName} ${item.employeeLastName} — ${t(item.typeName)}`}
                      title={t("Approve leave request")}
                      disabled={reviewBusyId !== null}
                      aria-busy={reviewBusyId === item.id}
                    >
                      <Check size={15} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {dialogOpen && !readOnlyPreview && (
        <LeaveRequestDialog
          balances={balances}
          holidays={holidays}
          workDays={workDays}
          onClose={() => setDialogOpen(false)}
          readOnlyPreview={readOnlyPreview}
        />
      )}
    </div>
  );
}

function LeaveRequestDialog({
  balances,
  holidays,
  workDays,
  onClose,
  readOnlyPreview = false,
}: {
  balances: Balance[];
  holidays: { date: string; name: string }[];
  workDays: string;
  onClose: () => void;
  readOnlyPreview?: boolean;
}) {
  const { locale, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dailyAmounts, setDailyAmounts] = useState<Record<string, 0 | 0.5 | 1>>(
    {},
  );
  const holidayDates = useMemo(
    () => new Set(holidays.map((item) => item.date)),
    [holidays],
  );
  const selectedDays = useMemo(
    () => buildLeaveDays(startDate, endDate, holidayDates, workDays),
    [endDate, holidayDates, startDate, workDays],
  );
  const selectedTotal = selectedDays.reduce(
    (total, day) => total + (dailyAmounts[day.date] ?? (day.working ? 1 : 0)),
    0,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnlyPreview) return;
    setBusy(true);
    setError("");
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    Object.assign(payload, {
      duration: "full",
      dailyAllocations: selectedDays.map((day) => ({
        date: day.date,
        amount: dailyAmounts[day.date] ?? (day.working ? 1 : 0),
      })),
    });
    const response = await fetch("/api/leave/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? t("Could not submit the request."));
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <div
        className="dialog compact-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-request-title"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Leave")}</p>
            <h2 id="leave-request-title">{t("Request leave")}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={19} />
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label className="span-two">
            {t("Leave type")}
            <span className="select-field">
              <select
                name="leaveTypeId"
                required
                defaultValue={balances[0]?.leaveTypeId}
              >
                {balances.map((balance) => {
                  const available =
                    balance.allowance + balance.adjustment - balance.used;
                  return (
                    <option value={balance.leaveTypeId} key={balance.id}>
                      {t(balance.name)} · {available} {t("days available")}
                    </option>
                  );
                })}
              </select>
              <ChevronDown size={15} />
            </span>
          </label>
          <DateField
            name="startDate"
            label={t("From")}
            value={startDate}
            required
            onValueChange={(value) => {
              setStartDate(value);
              if (!endDate || endDate < value) setEndDate(value);
            }}
          />
          <DateField
            key={endDate}
            name="endDate"
            label={t("To")}
            value={endDate}
            min={startDate || undefined}
            required
            onValueChange={setEndDate}
          />
          {selectedDays.length > 0 && (
            <fieldset className="span-two leave-day-editor">
              <legend>{t("Days in this request")}</legend>
              <p>{t("Choose a full day, half day or skip each date.")}</p>
              <div className="leave-day-editor-list">
                {selectedDays.map((day) => (
                  <label key={day.date}>
                    <span>
                      <strong>{formatLeaveDay(day.date)}</strong>
                      {!day.working && (
                        <small>{day.holidayName || t("Non-working day")}</small>
                      )}
                    </span>
                    <select
                      value={dailyAmounts[day.date] ?? (day.working ? 1 : 0)}
                      disabled={!day.working}
                      onChange={(event) =>
                        setDailyAmounts((current) => ({
                          ...current,
                          [day.date]: Number(event.target.value) as 0 | 0.5 | 1,
                        }))
                      }
                    >
                      <option value={0}>{t("Skip")}</option>
                      <option value={0.5}>{t("Half day")}</option>
                      <option value={1}>{t("Full day")}</option>
                    </select>
                  </label>
                ))}
              </div>
              <strong className="leave-day-total">
                {t("Total")}:{" "}
                {formatCount(
                  locale,
                  selectedTotal,
                  { one: "день", few: "дні", many: "днів" },
                  { one: "day", many: "days" },
                )}
              </strong>
            </fieldset>
          )}
          <label className="span-two">
            {t("Comment")}
            <textarea
              name="reason"
              rows={3}
              placeholder={t("Optional context for your manager")}
            />
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
            <button
              className="button primary-button"
              disabled={busy || selectedTotal <= 0}
            >
              {busy ? t("Submitting…") : t("Submit request")}
            </button>
          </div>
        </form>
      </div>
    </DialogBackdrop>
  );
}

function Status({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <span className={`status-badge ${value}`}>
      {t(value.replace("_", " "))}
    </span>
  );
}

function formatDateRange(start: string, end: string, locale: "uk" | "en") {
  const format = new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "numeric",
    month: "short",
  });
  return `${format.format(new Date(`${start}T12:00:00Z`))} – ${format.format(new Date(`${end}T12:00:00Z`))}`;
}

function buildLeaveDays(
  start: string,
  end: string,
  holidays: ReadonlySet<string>,
  workDays = "1,2,3,4,5",
) {
  if (!start || !end || end < start) return [];
  const result: {
    date: string;
    working: boolean;
    holidayName?: string;
  }[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return [];
  const scheduledDays = new Set(workDays.split(",").map(Number));
  while (cursor <= last && result.length < 366) {
    const date = cursor.toISOString().slice(0, 10);
    const weekday = cursor.getUTCDay();
    result.push({
      date,
      working:
        scheduledDays.has(weekday === 0 ? 7 : weekday) && !holidays.has(date),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function formatLeaveDay(date: string) {
  return new Intl.DateTimeFormat("uk-UA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00Z`));
}
