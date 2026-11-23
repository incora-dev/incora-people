"use client";

import { useEffect, useState } from "react";
import { Bug, ExternalLink } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";

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

export function BugTicketSettings() {
  const { t } = useI18n();
  const [reports, setReports] = useState<BugTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/bug-reports")
      .then(async (response) => {
        const data = (await response.json()) as { reports?: BugTicket[] };
        setReports(data.reports ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function changeStatus(id: number, status: "open" | "resolved") {
    setMessage("");
    const response = await fetch(`/api/admin/bug-reports?id=${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = (await response.json()) as {
      report?: BugTicket;
      error?: string;
    };
    if (!response.ok || !result.report) {
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
      <div className="bug-ticket-table">
        <div className="bug-ticket-head">
          <span>{t("Reporter")}</span>
          <span>{t("Description")}</span>
          <span>{t("Screenshot")}</span>
          <span>{t("Created")}</span>
          <span>{t("Status")}</span>
          <span />
        </div>
        {reports.map((report) => (
          <div className="bug-ticket-row" key={report.id}>
            <span data-label={t("Reporter")}>
              <strong>
                {report.reporterFirstName
                  ? `${report.reporterFirstName} ${report.reporterLastName ?? ""}`
                  : report.reporterEmail}
              </strong>
              <small>{report.reporterEmail}</small>
            </span>
            <p data-label={t("Description")}>{report.description}</p>
            <span data-label={t("Screenshot")}>
              {report.screenshotFileId && (
                <a
                  className="icon-button"
                  href={`/api/files/${report.screenshotFileId}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("Screenshot")}
                >
                  <ExternalLink size={15} />
                </a>
              )}
            </span>
            <small data-label={t("Created")}>
              {new Date(report.createdAt).toLocaleDateString()}
            </small>
            <span
              data-label={t("Status")}
              className={`status-badge ${
                report.status === "resolved" ? "approved" : "pending"
              }`}
            >
              {report.status === "resolved" ? t("Resolved") : t("Open")}
            </span>
            <label
              className="checkbox-field bug-ticket-resolution"
              data-label={t("Resolution")}
            >
              <input
                type="checkbox"
                checked={report.status === "resolved"}
                onChange={(event) =>
                  changeStatus(
                    report.id,
                    event.currentTarget.checked ? "resolved" : "open",
                  )
                }
              />
              <span>
                {report.status === "resolved"
                  ? t("Resolved")
                  : t("Mark resolved")}
              </span>
            </label>
          </div>
        ))}
        {!loading && reports.length === 0 && (
          <div className="compact-empty">{t("No bug tickets.")}</div>
        )}
        {loading && <div className="compact-empty">Завантаження…</div>}
      </div>
    </section>
  );
}
