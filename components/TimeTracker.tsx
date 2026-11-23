"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Coffee,
  Clock3,
  LogIn,
  LogOut,
  HousePlug,
  Download,
  Plus,
  Rows3,
  WandSparkles,
} from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { ScheduleCard } from "@/components/time/ScheduleCard";
import {
  DayEntriesDialog,
  ManualEntryDialog,
} from "@/components/time/TimeEntryDialogs";
import {
  dateKeyInTimeZone,
  getDayDateRange,
  getMonthDateRange,
  isoWeekday,
  type DateContext,
} from "@/modules/shared/date";
import type {
  BreakEntryDto as BreakEntry,
  TimeEntryDto as TimeEntry,
  TimeProjectDto as TimeProject,
  WorkScheduleDto as WorkSchedule,
} from "@/modules/time/types";
import {
  classifyWorkday,
  clippedDurationMinutes,
  intervalIntersectsRange,
  netDurationMinutes,
  netDurationMinutesClipped,
} from "@/modules/time/domain";

export function TimeTracker({
  openEntry,
  openBreak,
  initialHistory,
  initialBreaks,
  absenceDays,
  absenceAllocations,
  initialSchedule,
  initialDate,
  periodLocked,
  holidayDates,
  projects,
  readOnlyPreview = false,
}: {
  openEntry: TimeEntry | undefined;
  openBreak: BreakEntry | undefined;
  initialHistory: TimeEntry[];
  initialBreaks: BreakEntry[];
  absenceDays: number;
  absenceAllocations: Record<string, number>;
  initialSchedule: WorkSchedule | undefined;
  initialDate: DateContext;
  periodLocked: boolean;
  holidayDates: string[];
  projects: TimeProject[];
  readOnlyPreview?: boolean;
}) {
  const { locale, t } = useI18n();
  const [activeEntry, setActiveEntry] = useState(openEntry);
  const [activeBreak, setActiveBreak] = useState(openBreak);
  const [history, setHistory] = useState(initialHistory);
  const [breakHistory, setBreakHistory] = useState(initialBreaks);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [breakBusy, setBreakBusy] = useState(false);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  );
  const [selectedWorkMode, setSelectedWorkMode] = useState<
    "office" | "remote" | null
  >(openEntry?.workMode ?? null);
  const [view, setView] = useState<"month" | "week">("month");
  const date = initialDate;
  const monthDays = new Date(Date.UTC(date.year, date.month, 0)).getUTCDate();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const duration = activeEntry
    ? formatDuration(now - new Date(activeEntry.clockIn).getTime())
    : "00:00:00";

  const monthStats = useMemo(() => {
    const monthRange = getMonthDateRange(
      date.monthKey,
      schedule?.timezone ?? "Europe/Kyiv",
    );
    const monthEntries = history.filter((entry) => {
      if (!monthRange)
        return dateKeyInZone(entry.clockIn, schedule?.timezone).startsWith(
          date.monthKey,
        );
      const start = new Date(entry.clockIn).getTime();
      const end = entry.clockOut
        ? new Date(entry.clockOut).getTime()
        : Number.POSITIVE_INFINITY;
      return (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start < new Date(monthRange.utcEnd).getTime() &&
        end > new Date(monthRange.utcStart).getTime()
      );
    });
    const worked = monthEntries.reduce((total, entry) => {
      if (!entry.clockOut) return total;
      return (
        total +
        (monthRange
          ? netDurationMinutesClipped(entry, breakHistory, monthRange)
          : netDurationMinutes(entry, breakHistory))
      );
    }, 0);
    const breaks = breakHistory.reduce((total, entry) => {
      if (!entry.endedAt) return total;
      return (
        total +
        (monthRange
          ? clippedDurationMinutes(entry.startedAt, entry.endedAt, monthRange)
          : Math.max(
              0,
              Math.round(
                (new Date(entry.endedAt).getTime() -
                  new Date(entry.startedAt).getTime()) /
                  60000,
              ),
            ))
      );
    }, 0);
    const start = schedule?.startTime ?? "09:00";
    const end = schedule?.endTime ?? "18:00";
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    const daily = Math.max(
      0,
      endHour * 60 +
        endMinute -
        startHour * 60 -
        startMinute -
        (schedule?.breakMinutes ?? 60),
    );
    const workDays = new Set(
      (schedule?.workDays ?? "1,2,3,4,5").split(",").map(Number),
    );
    const holidaySet = new Set(holidayDates);
    const scheduledDays = Array.from(
      { length: monthDays },
      (_, index) => new Date(date.year, date.month - 1, index + 1),
    ).filter(
      (day) =>
        workDays.has(isoWeekday(day.getDay())) &&
        !holidaySet.has(
          `${date.monthKey}-${String(day.getDate()).padStart(2, "0")}`,
        ),
    ).length;
    const expected = scheduledDays * daily;
    const credited = worked + absenceDays * daily;
    return {
      worked,
      breaks,
      expected,
      overtime: Math.max(0, worked - expected),
      difference: credited - expected,
      daily,
    };
  }, [
    absenceDays,
    date.month,
    date.monthKey,
    date.year,
    history,
    holidayDates,
    breakHistory,
    monthDays,
    schedule,
  ]);

  async function toggle() {
    if (readOnlyPreview) return;
    if (!activeEntry && !selectedWorkMode) {
      setMessage(t("Choose where you are working before starting."));
      return;
    }
    setBusy(true);
    setMessage("");
    const response = await fetch(
      activeEntry ? "/api/time/clock-out" : "/api/time/clock-in",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          activeEntry
            ? {}
            : { projectId: selectedProjectId, workMode: selectedWorkMode },
        ),
      },
    );
    const result = (await response.json()) as {
      entry?: TimeEntry;
      mode?: "started" | "already_running" | "stopped" | "already_stopped";
      error?: string;
    };
    if (!response.ok || !result.entry) {
      setMessage(result.error ?? t("Could not update time."));
      setBusy(false);
      return;
    }

    if (result.mode === "started" || result.mode === "already_running") {
      setActiveEntry(result.entry);
      setActiveBreak(undefined);
      setHistory((items) => [
        result.entry!,
        ...items.filter((item) => item.id !== result.entry!.id),
      ]);
      setMessage(t("Workday started."));
    } else {
      setActiveEntry(undefined);
      setActiveBreak(undefined);
      setHistory((items) =>
        items.map((item) =>
          item.id === result.entry!.id ? result.entry! : item,
        ),
      );
      setMessage(t("Workday completed."));
      setSelectedWorkMode(null);
    }
    setBusy(false);
  }

  async function autofillToday() {
    if (readOnlyPreview) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/time/autofill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const result = (await response.json()) as {
      entry?: TimeEntry;
      break?: BreakEntry;
      error?: string;
    };
    if (response.ok && result.entry) {
      setHistory((items) => [result.entry!, ...items]);
      if (result.break) {
        setBreakHistory((items) => [
          result.break!,
          ...items.filter((item) => item.id !== result.break!.id),
        ]);
      }
      setMessage(t("Standard workday added."));
    } else {
      setMessage(result.error ?? t("Could not autofill today."));
    }
    setBusy(false);
  }

  async function toggleBreak() {
    if (readOnlyPreview) return;
    setBreakBusy(true);
    setMessage("");
    const response = await fetch("/api/time/break/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        activeBreak
          ? { action: "end", breakId: activeBreak.id }
          : { action: "start" },
      ),
    });
    const result = (await response.json()) as {
      entry?: BreakEntry;
      mode?: "break_start" | "break_end";
      error?: string;
    };
    if (!response.ok || !result.entry) {
      setMessage(result.error ?? t("Could not update the break."));
      setBreakBusy(false);
      return;
    }
    if (result.mode === "break_start") {
      setActiveBreak(result.entry);
      setBreakHistory((items) => [
        result.entry!,
        ...items.filter((item) => item.id !== result.entry!.id),
      ]);
    } else {
      setActiveBreak(undefined);
      setBreakHistory((items) =>
        items.map((item) =>
          item.id === result.entry!.id ? result.entry! : item,
        ),
      );
    }
    setMessage(
      result.mode === "break_start"
        ? t("Break started.")
        : t("Break completed."),
    );
    setBreakBusy(false);
  }

  return (
    <section className="time-layout">
      <article className="panel time-summary span-time-grid">
        <div className="time-summary-heading">
          <div>
            <p className="eyebrow">{formatMonth(date, locale)}</p>
            <h2>{t("Monthly summary")}</h2>
          </div>
          <div className="page-actions">
            {!readOnlyPreview && (
              <a className="button ghost-button" href="/api/time/export">
                <Download size={15} /> {t("Export")}
              </a>
            )}
            {!readOnlyPreview && (
              <button
                className="button primary-button"
                id="manual"
                onClick={() => {
                  setManualDate(date.today);
                  setManualOpen(true);
                }}
                disabled={periodLocked}
              >
                <Plus size={15} /> {t("Add time")}
              </button>
            )}
            {!readOnlyPreview && !activeEntry && !periodLocked && (
              <button
                className="button ghost-button"
                onClick={autofillToday}
                disabled={busy}
                title={t("Adds today’s standard workday from your schedule.")}
              >
                <WandSparkles size={15} /> {t("Fill today")}
              </button>
            )}
          </div>
        </div>
        {periodLocked && (
          <div className="time-warning">
            <AlertTriangle size={16} />{" "}
            {t(
              "This month is locked. Time entries and correction requests are read-only.",
            )}
          </div>
        )}
        {activeEntry &&
          dateKeyInZone(activeEntry.clockIn, schedule?.timezone) !==
            date.today && (
            <div className="time-warning">
              <AlertTriangle size={16} />{" "}
              {t("This entry may be missing a clock-out.")}
              <button
                className="text-link"
                onClick={() =>
                  setSelectedDate(
                    dateKeyInZone(activeEntry.clockIn, schedule?.timezone),
                  )
                }
              >
                {t("Open day")}
              </button>
            </div>
          )}
        <div className="time-metric-strip">
          <Metric
            label={t("Worked")}
            value={formatMinutes(monthStats.worked, t)}
          />
          <Metric
            label={t("Expected")}
            value={formatMinutes(monthStats.expected, t)}
          />
          <Metric
            label={t("Breaks")}
            value={formatMinutes(monthStats.breaks, t)}
          />
          <Metric label={t("Absence")} value={`${absenceDays} ${t("d")}`} />
          <Metric
            label={t("Overtime")}
            value={formatMinutes(monthStats.overtime, t)}
          />
          <Metric
            label={t("Difference")}
            value={`${monthStats.difference < 0 ? "−" : "+"}${formatMinutes(Math.abs(monthStats.difference), t)}`}
            tone={monthStats.difference < 0 ? "negative" : "positive"}
          />
        </div>
        <div
          className="time-view-switch"
          role="tablist"
          aria-label={t("Timesheet view")}
        >
          <button
            className={view === "month" ? "active" : ""}
            onClick={() => setView("month")}
            role="tab"
            aria-selected={view === "month"}
          >
            <CalendarDays size={14} /> {t("Month")}
          </button>
          <button
            className={view === "week" ? "active" : ""}
            onClick={() => setView("week")}
            role="tab"
            aria-selected={view === "week"}
          >
            <Rows3 size={14} /> {t("Week")}
          </button>
        </div>
        {view === "month" ? (
          <MonthCalendar
            history={history}
            breaks={breakHistory}
            absenceDays={absenceDays}
            absenceAllocations={absenceAllocations}
            date={date}
            holidayDates={holidayDates}
            expectedMinutes={monthStats.daily}
            schedule={schedule}
            onSelectDate={setSelectedDate}
          />
        ) : (
          <WeekOverview
            history={history}
            breaks={breakHistory}
            date={date}
            schedule={schedule}
          />
        )}
      </article>

      <article className="panel clock-card">
        <div className={activeEntry ? "clock-visual active" : "clock-visual"}>
          <Clock3 size={36} />
        </div>
        <p className="eyebrow">
          {activeEntry ? t("Clocked in") : t("Not tracking")}
        </p>
        <div className="live-time">{duration}</div>
        <p className="muted">
          {activeEntry
            ? `${t("Started today at")} ${formatTime(activeEntry.clockIn, schedule?.timezone)}`
            : t("Start when you begin your workday.")}
        </p>
        {!readOnlyPreview && !activeEntry && (
          <div className="time-work-mode-picker">
            <span>{t("Where are you working?")}</span>
            <div role="radiogroup" aria-label={t("Work mode")}>
              <button
                className={selectedWorkMode === "office" ? "active" : ""}
                type="button"
                role="radio"
                aria-checked={selectedWorkMode === "office"}
                onClick={() => {
                  setSelectedWorkMode("office");
                  setMessage("");
                }}
              >
                <Building2 size={16} /> {t("In office")}
              </button>
              <button
                className={selectedWorkMode === "remote" ? "active" : ""}
                type="button"
                role="radio"
                aria-checked={selectedWorkMode === "remote"}
                onClick={() => {
                  setSelectedWorkMode("remote");
                  setMessage("");
                }}
              >
                <HousePlug size={16} /> {t("Remote")}
              </button>
            </div>
          </div>
        )}
        {activeEntry && (
          <span className="active-work-mode">
            {activeEntry.workMode === "remote" ? (
              <HousePlug size={15} />
            ) : (
              <Building2 size={15} />
            )}
            {activeEntry.workMode === "remote" ? t("Remote") : t("In office")}
          </span>
        )}
        {activeBreak && (
          <span className="break-indicator">
            <Coffee size={15} /> {t("On break since")}{" "}
            {formatTime(activeBreak.startedAt, schedule?.timezone)}
          </span>
        )}
        {!readOnlyPreview && (
          <button
            className={
              activeEntry
                ? "button danger-button clock-button"
                : "button primary-button clock-button"
            }
            onClick={toggle}
            disabled={
              busy || periodLocked || (!activeEntry && !selectedWorkMode)
            }
          >
            {activeEntry ? <LogOut size={18} /> : <LogIn size={18} />}
            {busy ? t("Saving…") : activeEntry ? t("Clock out") : t("Clock in")}
          </button>
        )}
        {!readOnlyPreview && !activeEntry && projects.length > 0 && (
          <label className="time-project-picker">
            {t("Project")}
            <select
              value={selectedProjectId ?? ""}
              onChange={(event) =>
                setSelectedProjectId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            >
              <option value="">{t("No project")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} · {project.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!readOnlyPreview && activeEntry && (
          <button
            className="button ghost-button clock-button"
            onClick={toggleBreak}
            disabled={breakBusy}
          >
            <Coffee size={18} />
            {breakBusy
              ? t("Saving…")
              : activeBreak
                ? t("End break")
                : t("Start break")}
          </button>
        )}
        {message && (
          <p className="time-message">
            <CheckCircle2 size={16} /> {message}
          </p>
        )}
      </article>

      <ScheduleCard
        schedule={schedule}
        onSaved={setSchedule}
        readOnlyPreview={readOnlyPreview}
      />
      {selectedDate && (
        <DayEntriesDialog
          date={selectedDate}
          entries={history.filter((entry) =>
            entryOverlapsLocalDay(entry, selectedDate, schedule?.timezone),
          )}
          projects={projects}
          timeZone={schedule?.timezone}
          readOnlyPreview={readOnlyPreview}
          onClose={() => setSelectedDate(null)}
          onUpdated={(updated) =>
            setHistory((items) =>
              items.map((item) => (item.id === updated.id ? updated : item)),
            )
          }
          onAdd={() => {
            setManualDate(selectedDate);
            setSelectedDate(null);
            setManualOpen(true);
          }}
        />
      )}
      {manualOpen && !readOnlyPreview && (
        <ManualEntryDialog
          today={manualDate ?? date.today}
          projects={projects}
          timeZone={schedule?.timezone}
          onClose={() => setManualOpen(false)}
          onCreated={(created) => setHistory((items) => [created, ...items])}
        />
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MonthCalendar({
  history,
  breaks,
  absenceDays,
  absenceAllocations,
  date,
  holidayDates,
  expectedMinutes,
  schedule,
  onSelectDate,
}: {
  history: TimeEntry[];
  breaks: BreakEntry[];
  absenceDays: number;
  absenceAllocations: Record<string, number>;
  date: DateContext;
  holidayDates: string[];
  expectedMinutes: number;
  schedule: WorkSchedule | undefined;
  onSelectDate: (date: string) => void;
}) {
  const { locale, t } = useI18n();
  const monthDays = new Date(Date.UTC(date.year, date.month, 0)).getUTCDate();
  const timeZone = schedule?.timezone ?? "Europe/Kyiv";
  const entries = new Map<number, number>();
  for (let day = 1; day <= monthDays; day += 1) {
    const dateKey = `${date.monthKey}-${String(day).padStart(2, "0")}`;
    const range = getDayDateRange(dateKey, timeZone);
    if (!range) continue;
    const minutes = history.reduce(
      (total, entry) => total + netDurationMinutesClipped(entry, breaks, range),
      0,
    );
    entries.set(day, minutes);
  }
  const blanks = new Date(date.year, date.month - 1, 1).getDay() || 7;
  const scheduledWeekdays = new Set(
    (schedule?.workDays ?? "1,2,3,4,5").split(",").map(Number),
  );
  return (
    <div className="month-calendar">
      <div className="month-weekdays">
        {(locale === "uk"
          ? t("Day abbreviations").split(",")
          : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        ).map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-days">
        {Array.from({ length: blanks - 1 }, (_, index) => (
          <span className="empty" key={`blank-${index}`} />
        ))}
        {Array.from({ length: monthDays }, (_, index) => {
          const day = index + 1;
          const minutes = entries.get(day) ?? 0;
          const weekday = new Date(
            Date.UTC(date.year, date.month - 1, day),
          ).getUTCDay();
          const weekend = !scheduledWeekdays.has(isoWeekday(weekday));
          const holiday = holidayDates.includes(
            `${date.monthKey}-${String(day).padStart(2, "0")}`,
          );
          const dateKey = `${date.monthKey}-${String(day).padStart(2, "0")}`;
          const absenceAmount = Math.min(1, absenceAllocations[dateKey] ?? 0);
          const status = classifyWorkday({
            date: dateKey,
            today: date.today,
            workedMinutes: minutes,
            expectedMinutes,
            scheduled: !weekend,
            holiday,
            absenceAmount,
          });
          return (
            <button
              type="button"
              className={status === "open" ? "" : status}
              key={day}
              onClick={() => onSelectDate(dateKey)}
              aria-label={`${t("Open day")} ${dateKey}`}
            >
              <span>{day}</span>
              {minutes ? (
                <strong>{formatMinutes(minutes, t)}</strong>
              ) : (
                <small>
                  {holiday
                    ? t("Holiday")
                    : weekend
                      ? t("Weekend")
                      : absenceAmount > 0
                        ? t("Leave")
                        : "—"}
                </small>
              )}
            </button>
          );
        })}
      </div>
      {absenceDays > 0 && (
        <p className="calendar-note">
          {absenceDays}{" "}
          {t("approved absence day(s) are credited in the monthly difference.")}
        </p>
      )}
    </div>
  );
}

function WeekOverview({
  history,
  breaks,
  date,
  schedule,
}: {
  history: TimeEntry[];
  breaks: BreakEntry[];
  date: DateContext;
  schedule: WorkSchedule | undefined;
}) {
  const { locale, t } = useI18n();
  const today = new Date(`${date.today}T12:00:00`);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const expected = scheduledDayMinutes(schedule);
  const rows = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    const key = localDateKey(day);
    const range = getDayDateRange(key, schedule?.timezone ?? "Europe/Kyiv");
    const entries = history.filter((entry) => {
      if (!range)
        return dateKeyInZone(entry.clockIn, schedule?.timezone) === key;
      const start = new Date(entry.clockIn).getTime();
      const end = entry.clockOut
        ? new Date(entry.clockOut).getTime()
        : Number.POSITIVE_INFINITY;
      return (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start < new Date(range.utcEnd).getTime() &&
        end > new Date(range.utcStart).getTime()
      );
    });
    const worked = entries.reduce((total, entry) => {
      if (!entry.clockOut) return total;
      return (
        total +
        (range
          ? netDurationMinutesClipped(entry, breaks, range)
          : netDurationMinutes(entry, breaks))
      );
    }, 0);
    return { day, key, entries, worked };
  });
  return (
    <div className="week-overview">
      {rows.map((row) => (
        <div className={row.key === date.today ? "today" : ""} key={row.key}>
          <span>
            <strong>
              {new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
              }).format(row.day)}
            </strong>
            <small>
              {row.entries.length ? t("Recorded") : t("No entries")}
            </small>
          </span>
          <span>
            <strong>{formatMinutes(row.worked, t)}</strong>
            <small>
              {expected
                ? `${t("Expected")}: ${formatMinutes(expected, t)}`
                : ""}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatMinutes(minutes: number, t: (key: string) => string) {
  return `${Math.floor(minutes / 60)} ${t("h")} ${minutes % 60} ${t("m")}`;
}

function scheduledDayMinutes(schedule: WorkSchedule | undefined) {
  if (!schedule) return 0;
  const [startHour, startMinute] = schedule.startTime.split(":").map(Number);
  const [endHour, endMinute] = schedule.endTime.split(":").map(Number);
  return Math.max(
    0,
    endHour * 60 +
      endMinute -
      startHour * 60 -
      startMinute -
      schedule.breakMinutes,
  );
}

function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dateKeyInZone(value: string, timeZone = "Europe/Kyiv") {
  return dateKeyInTimeZone(value, timeZone) ?? "";
}

function entryOverlapsLocalDay(
  entry: TimeEntry,
  date: string,
  timeZone = "Europe/Kyiv",
) {
  const range = getDayDateRange(date, timeZone);
  if (!range) return dateKeyInZone(entry.clockIn, timeZone) === date;
  return intervalIntersectsRange(entry.clockIn, entry.clockOut, range);
}

function formatTime(value: string, timeZone = "Europe/Kyiv") {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function formatMonth(date: DateContext, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(date.year, date.month - 1, 1));
}
