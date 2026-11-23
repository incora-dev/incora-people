"use client";

import { FormEvent, useState } from "react";
import { CalendarClock, PencilLine, X } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import type { WorkScheduleDto } from "@/modules/time/types";
import { formatCount } from "@/lib/i18n";

export function ScheduleCard({
  schedule,
  onSaved,
  readOnlyPreview = false,
}: {
  schedule: WorkScheduleDto | undefined;
  onSaved: (schedule: WorkScheduleDto) => void;
  readOnlyPreview?: boolean;
}) {
  const { locale, t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const days = schedule?.workDays.split(",").length ?? 5;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const response = await fetch("/api/schedules/me", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as {
      schedule?: WorkScheduleDto;
    };
    if (response.ok && result.schedule) {
      onSaved(result.schedule);
      setEditing(false);
    }
    setBusy(false);
  }

  return (
    <article className="panel schedule-card">
      <div className="schedule-icon">
        <CalendarClock size={23} />
      </div>
      <div className="schedule-copy">
        <p className="eyebrow">{t("Work schedule")}</p>
        <h2>
          {formatCount(
            locale,
            days,
            { one: "день", few: "дні", many: "днів" },
            { one: "day", many: "days" },
          )}{" "}
          · {schedule?.startTime ?? "09:00"}–{schedule?.endTime ?? "18:00"}
        </h2>
        <p>
          {schedule?.breakMinutes ?? 60} {t("min")} {t("break")} ·{" "}
          {schedule?.timezone ?? "Europe/Kyiv"}
        </p>
      </div>
      {!readOnlyPreview && (
        <button
          className="button ghost-button"
          onClick={() => setEditing(true)}
        >
          <PencilLine size={16} /> {t("Edit")}
        </button>
      )}
      {editing && !readOnlyPreview && (
        <DialogBackdrop onClose={() => setEditing(false)}>
          <div className="dialog small-dialog" role="dialog" aria-modal="true">
            <div className="dialog-header">
              <div>
                <p className="eyebrow">{t("Time")}</p>
                <h2>{t("Work schedule")}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setEditing(false)}
                aria-label={t("Close")}
              >
                <X size={20} />
              </button>
            </div>
            <form className="form-grid" onSubmit={submit}>
              <label>
                {t("Start time")}
                <input
                  name="startTime"
                  type="time"
                  defaultValue={schedule?.startTime ?? "09:00"}
                  required
                />
              </label>
              <label>
                {t("End time")}
                <input
                  name="endTime"
                  type="time"
                  defaultValue={schedule?.endTime ?? "18:00"}
                  required
                />
              </label>
              <label>
                {t("Break, minutes")}
                <input
                  name="breakMinutes"
                  type="number"
                  min="0"
                  max="180"
                  defaultValue={schedule?.breakMinutes ?? 60}
                  required
                />
              </label>
              <label>
                {t("Timezone")}
                <select
                  name="timezone"
                  defaultValue={schedule?.timezone ?? "Europe/Kyiv"}
                >
                  <option>Europe/Kyiv</option>
                  <option>Europe/Warsaw</option>
                  <option>UTC</option>
                </select>
              </label>
              <label className="span-two">
                {t("Work days")}
                <select
                  name="workDays"
                  defaultValue={schedule?.workDays ?? "1,2,3,4,5"}
                >
                  <option value="1,2,3,4,5">{t("Monday–Friday")}</option>
                  <option value="1,2,3,4">{t("Monday–Thursday")}</option>
                  <option value="2,3,4,5,6">{t("Tuesday–Saturday")}</option>
                </select>
              </label>
              <div className="dialog-actions span-two">
                <button
                  type="button"
                  className="button ghost-button"
                  onClick={() => setEditing(false)}
                >
                  {t("Cancel")}
                </button>
                <button className="button primary-button" disabled={busy}>
                  {busy ? t("Saving…") : t("Save schedule")}
                </button>
              </div>
            </form>
          </div>
        </DialogBackdrop>
      )}
    </article>
  );
}
