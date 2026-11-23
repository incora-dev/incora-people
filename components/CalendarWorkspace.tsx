"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { getDateContext } from "@/modules/shared/date";
import { formatCount } from "@/lib/i18n";
import {
  groupLeaveCalendarEvents,
  type LeaveCalendarEvent,
} from "@/modules/leave/calendar";

export function CalendarWorkspace({
  events,
  readOnlyPreview = false,
}: {
  events: LeaveCalendarEvent[];
  readOnlyPreview?: boolean;
}) {
  const { locale, t } = useI18n();
  const current = useMemo(() => getDateContext(), []);
  const [month, setMonth] = useState(
    () => new Date(current.year, current.month - 1, 1),
  );
  const [department, setDepartment] = useState("__all__");
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const days = Array.from(
    { length: new Date(year, monthIndex + 1, 0).getDate() },
    (_, index) => index + 1,
  );
  const departments = [
    "__all__",
    ...new Set(events.map((event) => event.department)),
  ];
  const visible = useMemo(() => {
    const monthStart = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    const monthEnd = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(days.length).padStart(2, "0")}`;
    return groupLeaveCalendarEvents(
      events.filter(
        (event) =>
          event.startDate <= monthEnd &&
          event.endDate >= monthStart &&
          (department === "__all__" || event.department === department),
      ),
    );
  }, [days.length, department, events, monthIndex, year]);

  function move(delta: number) {
    setMonth(new Date(year, monthIndex + delta, 1));
  }

  return (
    <>
      <section className="page-heading-row">
        <div>
          <h1>{t("Calendar")}</h1>
          <p>{t("Company leave and availability.")}</p>
        </div>
        {!readOnlyPreview && (
          <Link className="button primary-button" href="/leave">
            <Plus size={16} /> {t("Request leave")}
          </Link>
        )}
      </section>
      <div className="calendar-toolbar">
        <button
          className="compact-control"
          onClick={() => setMonth(new Date(current.year, current.month - 1, 1))}
        >
          {t("Current month")}
        </button>
        <button
          className="square-control"
          onClick={() => move(-1)}
          aria-label={t("Previous month")}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="square-control"
          onClick={() => move(1)}
          aria-label={t("Next month")}
        >
          <ChevronRight size={16} />
        </button>
        <strong>
          {new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en", {
            month: "long",
            year: "numeric",
          }).format(month)}
        </strong>
        <select
          className="compact-control push-right"
          aria-label={t("Department")}
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
        >
          {departments.map((item) => (
            <option value={item} key={item}>
              {item === "__all__" ? t("All departments") : item}
            </option>
          ))}
        </select>
      </div>
      <section className="panel team-calendar">
        <div
          className="team-calendar-head"
          style={{ gridTemplateColumns: `180px repeat(${days.length}, 30px)` }}
        >
          <span>{t("Employee")}</span>
          {days.map((day) => {
            const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            return (
              <span
                className={date === current.today ? "today" : ""}
                key={day}
                aria-label={new Intl.DateTimeFormat(
                  locale === "uk" ? "uk-UA" : "en",
                  { day: "numeric", month: "long", year: "numeric" },
                ).format(new Date(`${date}T12:00:00`))}
              >
                {day}
              </span>
            );
          })}
        </div>
        {visible.map((person) => {
          const absenceSummary = person.absences
            .map(
              (absence) =>
                `${t(absence.typeName)} · ${absence.startDate} — ${absence.endDate}`,
            )
            .join("; ");
          return (
            <div
              className="team-calendar-row"
              role="group"
              style={{
                gridTemplateColumns: `180px repeat(${days.length}, 30px)`,
              }}
              key={person.employeeId}
              aria-label={`${person.firstName} ${person.lastName} · ${absenceSummary}`}
            >
              <span className="calendar-person">
                <span className="avatar small">
                  {person.firstName[0]}
                  {person.lastName[0]}
                </span>
                <span>
                  <strong>
                    {person.firstName} {person.lastName}
                  </strong>
                  <small>
                    {person.department} ·{" "}
                    {formatCount(
                      locale,
                      person.absences.length,
                      {
                        one: "відсутність",
                        few: "відсутності",
                        many: "відсутностей",
                      },
                      { one: "absence", many: "absences" },
                    )}
                  </small>
                </span>
              </span>
              {days.map((day) => {
                const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const activeAbsences = person.absences.filter(
                  (absence) =>
                    date >= absence.startDate && date <= absence.endDate,
                );
                const activeSummary = activeAbsences
                  .map(
                    (absence) =>
                      `${t(absence.typeName)} · ${absence.startDate} — ${absence.endDate}`,
                  )
                  .join("; ");
                return (
                  <span
                    className={
                      date === current.today
                        ? "calendar-cell today"
                        : "calendar-cell"
                    }
                    key={day}
                  >
                    {activeAbsences.length > 0 && (
                      <i
                        style={{ background: activeAbsences[0].color }}
                        title={activeSummary}
                        role="img"
                        aria-label={`${person.firstName} ${person.lastName} · ${activeSummary}`}
                      />
                    )}
                  </span>
                );
              })}
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="calendar-empty">
            {t("No approved leave in this month.")}
          </div>
        )}
      </section>
      <section
        className="panel calendar-agenda"
        aria-label={t("Calendar events")}
      >
        <div className="data-panel-heading">
          <div>
            <h2>{t("Calendar events")}</h2>
            <span>{t("Absence by person and date range")}</span>
          </div>
        </div>
        {visible.map((person) => {
          const absenceSummary = person.absences
            .map(
              (absence) =>
                `${t(absence.typeName)} · ${absence.startDate} — ${absence.endDate}`,
            )
            .join("; ");
          return (
            <Link
              className="calendar-agenda-item"
              href={`/employees/${person.employeeId}`}
              key={person.employeeId}
              aria-label={`${person.firstName} ${person.lastName} · ${absenceSummary}`}
            >
              <span
                className="calendar-agenda-color"
                style={{ background: person.absences[0].color }}
                aria-hidden="true"
              />
              <span>
                <strong>
                  {person.firstName} {person.lastName}
                </strong>
                <small>
                  {person.department} ·{" "}
                  {formatCount(
                    locale,
                    person.absences.length,
                    {
                      one: "відсутність",
                      few: "відсутності",
                      many: "відсутностей",
                    },
                    { one: "absence", many: "absences" },
                  )}
                </small>
              </span>
              <time
                dateTime={person.absences[0]?.startDate}
                title={absenceSummary}
              >
                {person.absences
                  .map((absence) => `${absence.startDate} — ${absence.endDate}`)
                  .join(", ")}
              </time>
            </Link>
          );
        })}
        {visible.length === 0 && (
          <div className="calendar-empty">
            {t("No approved leave in this month.")}
          </div>
        )}
      </section>
    </>
  );
}
