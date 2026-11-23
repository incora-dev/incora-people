"use client";

import { Activity } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";

export type AuditEventDto = {
  id: number;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
};

export function AuditSettings({ events }: { events: AuditEventDto[] }) {
  const { locale, t } = useI18n();
  return (
    <section className="panel audit-panel admin-audit-panel">
      <div className="data-panel-heading">
        <div>
          <h2>{t("Audit log")}</h2>
          <span>{t("A trace of important changes in the workspace.")}</span>
        </div>
        <Activity size={18} />
      </div>
      <div className="audit-head">
        <span>{t("Event")}</span>
        <span>{t("Actor")}</span>
        <span>{t("When")}</span>
      </div>
      {events.map((event) => (
        <div className="audit-row" key={event.id}>
          <span className="audit-event">
            <span className="audit-mark" />
            <span>
              <strong>{humanize(event.action)}</strong>
              <small>
                {event.details || `${event.entityType} #${event.entityId}`}
              </small>
            </span>
          </span>
          <span>{event.actorEmail}</span>
          <span>{formatDateTime(event.createdAt, locale)}</span>
        </div>
      ))}
      {events.length === 0 && (
        <div className="compact-empty">{t("No audit events.")}</div>
      )}
    </section>
  );
}

function humanize(value: string) {
  return value
    .replaceAll(".", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string, locale: "uk" | "en") {
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(new Date(normalized));
}
