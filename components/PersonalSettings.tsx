"use client";

import { useState } from "react";
import { Bug, Check, Languages } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/i18n";

type BugReportRow = {
  id: number;
  description: string;
  status: string;
  screenshotFileId: string | null;
  createdAt: string;
};

export function PersonalSettings({
  initialLocale,
  reports,
}: {
  initialLocale: Locale;
  reports: BugReportRow[];
}) {
  const { t } = useI18n();
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [saving, setSaving] = useState(false);

  async function saveLocale() {
    setSaving(true);
    const response = await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale }),
    });
    if (response.ok) window.location.reload();
    else setSaving(false);
  }

  return (
    <div className="personal-settings-page">
      <section className="page-heading-row">
        <div>
          <p className="eyebrow">{t("Account settings")}</p>
          <h1>{t("Personal settings")}</h1>
          <p>{t("Language and personal shortcuts")}</p>
        </div>
      </section>
      <div className="personal-settings-content">
        <article className="panel personal-setting-card">
          <Languages size={20} aria-hidden="true" />
          <div>
            <h2>{t("Interface language")}</h2>
            <p>{t("Changes apply after saving.")}</p>
            <div className="language-options">
              <label>
                <input
                  type="radio"
                  name="locale"
                  value="uk"
                  checked={locale === "uk"}
                  onChange={() => setLocale("uk")}
                />
                <span>{t("Ukrainian")}</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="locale"
                  value="en"
                  checked={locale === "en"}
                  onChange={() => setLocale("en")}
                />
                <span>{t("English")}</span>
              </label>
            </div>
            <button
              className="button primary-button"
              onClick={saveLocale}
              disabled={saving}
            >
              <Check size={15} /> {t("Save language")}
            </button>
          </div>
        </article>
        <section
          className="panel data-panel personal-bug-reports"
          id="bug-reports"
        >
          <header className="personal-bug-reports-heading">
            <div>
              <h2>{t("Your bug reports")}</h2>
              <p>{t("Track reports submitted to the administrators.")}</p>
            </div>
            <Bug size={18} aria-hidden="true" />
          </header>
          <div className="personal-bug-list">
            {reports.map((report) => (
              <article className="personal-bug-report-row" key={report.id}>
                <div className="personal-bug-report-copy">
                  <p>{report.description}</p>
                  <small>
                    {new Date(report.createdAt).toLocaleDateString()}
                  </small>
                </div>
                <div className="personal-bug-report-meta">
                  <span
                    className={`status-badge ${
                      report.status === "resolved" ? "approved" : "pending"
                    }`}
                  >
                    {report.status === "resolved" ? t("Resolved") : t("Open")}
                  </span>
                  {report.screenshotFileId && (
                    <a
                      href={`/api/files/${report.screenshotFileId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("Screenshot")}
                    </a>
                  )}
                </div>
              </article>
            ))}
            {reports.length === 0 && (
              <div className="compact-empty personal-bug-report-empty">
                {t("No bug reports yet.")}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
