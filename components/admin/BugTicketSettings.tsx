"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bug, Check, ExternalLink, RotateCcw } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import type {
  DataTableColumn,
  DataTableRowAction,
} from "@/components/ui/DataTable/types";

type BugTicket = {
  id: number;
  reporterEmail: string;
  reporterFirstName: string | null;
  reporterLastName: string | null;
  description: string;
  screenshotFileId: string | null;
  status: string;
  createdAt: string;
};

function reporterName(report: BugTicket) {
  return report.reporterFirstName
    ? `${report.reporterFirstName} ${report.reporterLastName ?? ""}`.trim()
    : report.reporterEmail;
}

export function BugTicketSettings() {
  const { t } = useI18n();
  const [reports, setReports] = useState<BugTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  // One status change at a time: each one notifies the reporter, so a
  // double click must not send two.
  const [busyId, setBusyId] = useState<number | null>(null);
  // The ref blocks a second click that lands before the re-render.
  const busyRef = useRef(false);

  useEffect(() => {
    fetch("/api/admin/bug-reports")
      .then(async (response) => {
        const data = (await response.json()) as { reports?: BugTicket[] };
        setReports(data.reports ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function changeStatus(id: number, status: "open" | "resolved") {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(id);
    setMessage("");
    let result: { report?: BugTicket; error?: string } = {};
    let ok = false;
    try {
      const response = await fetch(`/api/admin/bug-reports?id=${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      ok = response.ok;
      result = (await response.json().catch(() => ({}))) as typeof result;
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
    if (!ok || !result.report) {
      setMessage(result.error ?? "Не вдалося оновити повідомлення.");
      return;
    }
    setReports((items) =>
      items.map((item) =>
        item.id === id ? { ...item, status: result.report!.status } : item,
      ),
    );
    setMessage(
      status === "resolved"
        ? "Помилку позначено як виправлену. Автор отримав сповіщення."
        : "Повідомлення відкрито повторно. Автор отримав сповіщення.",
    );
  }

  const columns = useMemo<DataTableColumn<BugTicket>[]>(
    () => [
      {
        key: "reporter",
        header: "Reporter",
        minWidth: 180,
        sortValue: reporterName,
        cell: (report) => (
          <span className="bug-ticket-reporter">
            <strong>{reporterName(report)}</strong>
            {/* Without a name the email is already the bold line. */}
            {report.reporterFirstName && <small>{report.reporterEmail}</small>}
          </span>
        ),
      },
      {
        key: "description",
        header: "Description",
        minWidth: 260,
        // Free text: takes the spare width and wraps instead of widening.
        grow: 1,
        truncate: true,
        cell: (report) => (
          <p className="bug-ticket-description">{report.description}</p>
        ),
      },
      {
        key: "created",
        header: "Created",
        minWidth: 100,
        sortValue: (report) => report.createdAt,
        cell: (report) => new Date(report.createdAt).toLocaleDateString(),
      },
      {
        key: "status",
        header: "Status",
        minWidth: 100,
        // "open" sorts before "resolved".
        sortValue: (report) => report.status,
        cell: (report) => (
          <span
            className={`status-badge ${
              report.status === "resolved" ? "approved" : "pending"
            }`}
          >
            {report.status === "resolved" ? t("Resolved") : t("Open")}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <section className="panel data-panel bug-ticket-panel">
      <div className="data-panel-heading">
        <div>
          <h2>{t("Bug tickets")}</h2>
          <span>{t("Reported product issues")}</span>
        </div>
        <span className="ticket-count">
          <Bug size={15} />{" "}
          {reports.filter((item) => item.status === "open").length}
        </span>
      </div>
      {message && <p className="settings-inline-message">{message}</p>}
      <DataTable
        rows={reports}
        rowKey={(report) => report.id}
        columns={columns}
        ariaLabel={t("Bug tickets")}
        defaultSort={{ key: "created", direction: "desc" }}
        loading={loading}
        empty={{ icon: Bug, text: t("No bug tickets.") }}
        rowActions={(report) => {
          const actions: DataTableRowAction[] = [];
          if (report.screenshotFileId)
            actions.push({
              icon: ExternalLink,
              label: t("Screenshot"),
              href: `/api/files/${report.screenshotFileId}`,
            });
          actions.push(
            report.status === "resolved"
              ? {
                  icon: RotateCcw,
                  label: t("Reopen ticket"),
                  disabled: busyId !== null,
                  onClick: () => changeStatus(report.id, "open"),
                }
              : {
                  icon: Check,
                  label: t("Mark resolved"),
                  disabled: busyId !== null,
                  onClick: () => changeStatus(report.id, "resolved"),
                },
          );
          return actions;
        }}
      />
    </section>
  );
}
