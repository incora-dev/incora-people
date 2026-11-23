"use client";

import { FormEvent, useState } from "react";
import { Building2, HousePlug, PencilLine, Plus, X } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { dateKeyInTimeZone, zonedDateTimeToUtc } from "@/modules/shared/date";
import type {
  TimeCorrectionDto,
  TimeEntryDto,
  TimeProjectDto,
} from "@/modules/time/types";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { DateField } from "@/components/ui/DateField";

export function ManualEntryDialog({
  today,
  projects,
  onClose,
  onCreated,
  timeZone = "Europe/Kyiv",
}: {
  today: string;
  projects: TimeProjectDto[];
  onClose: () => void;
  onCreated?: (entry: TimeEntryDto) => void;
  timeZone?: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const date = String(data.get("date"));
    const response = await fetch("/api/time/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clockIn: toUtcIso(date, String(data.get("clockIn")), timeZone),
        clockOut: toUtcIso(date, String(data.get("clockOut")), timeZone),
        note: data.get("note"),
        projectId: data.get("projectId") || null,
        timeCode: data.get("timeCode"),
        workMode: data.get("workMode"),
      }),
    });
    const result = (await response.json()) as {
      entry?: TimeEntryDto;
      error?: string;
    };
    if (!response.ok) {
      setError(result.error ?? "Could not add the time entry.");
      setBusy(false);
      return;
    }
    if (result.entry && onCreated) {
      onCreated(result.entry);
      onClose();
    } else window.location.reload();
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <div className="dialog small-dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Timesheet")}</p>
            <h2>{t("Add time manually")}</h2>
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
            {t("Work mode")}
            <select name="workMode" defaultValue="office">
              <option value="office">{t("In office")}</option>
              <option value="remote">{t("Remote")}</option>
            </select>
          </label>
          <div className="span-two">
            <DateField name="date" label={t("Date")} value={today} required />
          </div>
          <label>
            {t("Clock in")}
            <input name="clockIn" type="time" defaultValue="09:00" required />
          </label>
          <label>
            {t("Clock out")}
            <input name="clockOut" type="time" defaultValue="18:00" required />
          </label>
          <label className="span-two">
            {t("Project")}
            <select name="projectId" defaultValue="">
              <option value="">{t("No project")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} · {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="span-two">
            {t("Time code")}
            <select name="timeCode" defaultValue="project">
              <option value="project">{t("Project work")}</option>
              <option value="internal">{t("Internal work")}</option>
              <option value="learning">{t("Learning")}</option>
              <option value="admin">{t("Administration")}</option>
            </select>
          </label>
          <label className="span-two">
            {t("Note")}
            <textarea name="note" rows={3} placeholder={t("Optional note")} />
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
            <button className="button primary-button" disabled={busy}>
              {busy ? t("Adding…") : t("Add entry")}
            </button>
          </div>
        </form>
      </div>
    </DialogBackdrop>
  );
}

export function DayEntriesDialog({
  date,
  entries,
  projects,
  onClose,
  onUpdated,
  onAdd,
  timeZone = "Europe/Kyiv",
  readOnlyPreview = false,
}: {
  date: string;
  entries: TimeEntryDto[];
  projects: TimeProjectDto[];
  onClose: () => void;
  onUpdated: (entry: TimeEntryDto) => void;
  onAdd: () => void;
  timeZone?: string;
  readOnlyPreview?: boolean;
}) {
  const { locale, t } = useI18n();
  const [editing, setEditing] = useState<TimeEntryDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnlyPreview) return;
    if (!editing) return;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/time/entries", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        clockIn: toUtcIso(
          String(data.get("clockInDate")),
          String(data.get("clockIn")),
          timeZone,
        ),
        clockOut: toUtcIso(
          String(data.get("clockOutDate")),
          String(data.get("clockOut")),
          timeZone,
        ),
        projectId: data.get("projectId") || null,
        timeCode: data.get("timeCode"),
        workMode: data.get("workMode"),
        note: data.get("note"),
      }),
    });
    const result = (await response.json()) as {
      entry?: TimeEntryDto;
      error?: string;
    };
    if (!response.ok || !result.entry) {
      setError(result.error ?? t("Could not update time."));
    } else {
      onUpdated(result.entry);
      setEditing(null);
    }
    setBusy(false);
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <div
        className="dialog day-entries-dialog"
        role="dialog"
        aria-modal="true"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Work sessions")}</p>
            <h2>
              {new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
                dateStyle: "long",
              }).format(new Date(`${date}T12:00:00`))}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={19} />
          </button>
        </div>
        {editing && !readOnlyPreview ? (
          <form className="form-grid" onSubmit={save}>
            <DateField
              name="clockInDate"
              label={t("Clock-in date")}
              value={dateKeyInTimeZone(editing.clockIn, timeZone) ?? date}
              required
            />
            <label>
              {t("Clock in")}
              <input
                name="clockIn"
                type="time"
                defaultValue={timeInZone(editing.clockIn, timeZone)}
                required
              />
            </label>
            <DateField
              name="clockOutDate"
              label={t("Clock-out date")}
              value={
                editing.clockOut
                  ? (dateKeyInTimeZone(editing.clockOut, timeZone) ?? date)
                  : date
              }
              required
            />
            <label>
              {t("Clock out")}
              <input
                name="clockOut"
                type="time"
                defaultValue={
                  editing.clockOut
                    ? timeInZone(editing.clockOut, timeZone)
                    : "18:00"
                }
                required
              />
            </label>
            <label>
              {t("Work mode")}
              <select name="workMode" defaultValue={editing.workMode}>
                <option value="office">{t("In office")}</option>
                <option value="remote">{t("Remote")}</option>
              </select>
            </label>
            <label>
              {t("Project")}
              <select name="projectId" defaultValue={editing.projectId ?? ""}>
                <option value="">{t("No project")}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} · {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-two">
              {t("Time code")}
              <select name="timeCode" defaultValue={editing.timeCode}>
                <option value="project">{t("Project work")}</option>
                <option value="internal">{t("Internal work")}</option>
                <option value="learning">{t("Learning")}</option>
                <option value="admin">{t("Administration")}</option>
              </select>
            </label>
            <label className="span-two">
              {t("Note")}
              <textarea
                name="note"
                defaultValue={editing.note ?? ""}
                rows={3}
              />
            </label>
            {error && <p className="form-error span-two">{error}</p>}
            <div className="dialog-actions span-two">
              <button
                className="button ghost-button"
                type="button"
                onClick={() => setEditing(null)}
              >
                {t("Cancel")}
              </button>
              <button className="button primary-button" disabled={busy}>
                {busy ? t("Saving…") : t("Save")}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="day-entry-list">
              {entries.map((entry) => (
                <article key={entry.id}>
                  <span className="day-entry-mode">
                    {entry.workMode === "remote" ? (
                      <HousePlug size={16} />
                    ) : (
                      <Building2 size={16} />
                    )}
                  </span>
                  <span>
                    <strong>
                      {formatEntryRange(entry, date, timeZone, t("Now"))}
                    </strong>
                    <small>
                      {entry.workMode === "remote"
                        ? t("Remote")
                        : t("In office")}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </small>
                  </span>
                  {!readOnlyPreview && entry.clockOut && (
                    <button
                      className="icon-button"
                      onClick={() => setEditing(entry)}
                      aria-label={t("Edit")}
                    >
                      <PencilLine size={15} />
                    </button>
                  )}
                </article>
              ))}
              {entries.length === 0 && (
                <p className="muted">{t("No work sessions for this day.")}</p>
              )}
            </div>
            {!readOnlyPreview && (
              <button
                className="button primary-button full-button"
                onClick={onAdd}
              >
                <Plus size={15} /> {t("Add time")}
              </button>
            )}
          </>
        )}
      </div>
    </DialogBackdrop>
  );
}

function toUtcIso(date: string, time: string, timeZone: string) {
  const value = zonedDateTimeToUtc(date, time, timeZone);
  if (!value) throw new Error("Invalid date or time");
  return value.toISOString();
}

function timeInZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(value));
}

function formatEntryRange(
  entry: TimeEntryDto,
  selectedDate: string,
  timeZone: string,
  nowLabel: string,
) {
  const startDate = dateKeyInTimeZone(entry.clockIn, timeZone) ?? selectedDate;
  const endDate = entry.clockOut
    ? (dateKeyInTimeZone(entry.clockOut, timeZone) ?? startDate)
    : startDate;
  const start = timeInZone(entry.clockIn, timeZone);
  const end = entry.clockOut ? timeInZone(entry.clockOut, timeZone) : nowLabel;
  return startDate === endDate
    ? `${start} — ${end}`
    : `${startDate} ${start} — ${endDate} ${end}`;
}

export function CorrectionDialog({
  entry,
  onClose,
  onCreated,
}: {
  entry: TimeEntryDto;
  onClose: () => void;
  onCreated: (item: TimeCorrectionDto) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const date = entry.clockIn.slice(0, 10);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/time/corrections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        timeEntryId: entry.id,
        requestedClockIn: `${date}T${data.get("clockIn")}:00`,
        requestedClockOut: `${date}T${data.get("clockOut")}:00`,
        reason: data.get("reason"),
      }),
    });
    const result = (await response.json()) as {
      correction?: TimeCorrectionDto;
      error?: string;
    };
    if (!response.ok || !result.correction) {
      setError(result.error ?? "Could not create the request.");
      setBusy(false);
      return;
    }
    onCreated(result.correction);
  }

  return (
    <DialogBackdrop onClose={onClose}>
      <div className="dialog small-dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{t("Timesheet")}</p>
            <h2>{t("Request a correction")}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X size={20} />
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            {t("Clock in")}
            <input
              name="clockIn"
              type="time"
              defaultValue={entry.clockIn.slice(11, 16)}
              required
            />
          </label>
          <label>
            {t("Clock out")}
            <input
              name="clockOut"
              type="time"
              defaultValue={entry.clockOut?.slice(11, 16) ?? "18:00"}
              required
            />
          </label>
          <label className="span-two">
            {t("Reason")}
            <textarea
              name="reason"
              rows={4}
              placeholder={t("Explain what needs to be corrected…")}
              required
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
            <button className="button primary-button" disabled={busy}>
              {busy ? t("Sending…") : t("Send request")}
            </button>
          </div>
        </form>
      </div>
    </DialogBackdrop>
  );
}
