"use client";

import { FormEvent, useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DateField } from "@/components/ui/DateField";
import type { CompanyHolidayDto } from "@/modules/admin/types";

export function HolidaySettings({
  holidays: initialHolidays,
  onMessage,
}: {
  holidays: CompanyHolidayDto[];
  onMessage: (message: string) => void;
}) {
  const { locale, t } = useI18n();
  const [holidays, setHolidays] = useState(initialHolidays);
  const [busy, setBusy] = useState(false);

  async function addHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/admin/holidays", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as {
      holiday?: CompanyHolidayDto;
      error?: string;
    };
    if (response.ok && result.holiday) {
      setHolidays((items) =>
        [...items, result.holiday!].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      );
      form.reset();
      onMessage("Company holiday added.");
    } else {
      onMessage(result.error ?? "Could not add the company holiday.");
    }
    setBusy(false);
  }

  async function removeHoliday(id: number) {
    const response = await fetch(`/api/admin/holidays/${id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setHolidays((items) => items.filter((item) => item.id !== id));
      onMessage("Company holiday removed.");
    } else {
      onMessage("Could not remove the company holiday.");
    }
  }

  return (
    <section className="panel data-panel holiday-settings">
      <div className="data-panel-heading">
        <div>
          <h2>{t("Company non-working days")}</h2>
          <span>
            {t(
              "These dates are excluded automatically from Leave calculations.",
            )}
          </span>
        </div>
      </div>
      <form className="holiday-create-form" onSubmit={addHoliday}>
        <DateField name="date" label={t("Date")} required />
        <label>
          {t("Holiday name")}
          <input
            name="name"
            placeholder={t("e.g. Company winter holiday")}
            required
          />
        </label>
        <button className="button primary-button" disabled={busy}>
          <Plus size={15} /> {busy ? t("Adding…") : t("Add day")}
        </button>
      </form>
      <div className="holiday-list">
        {holidays.map((holiday) => (
          <div key={holiday.id}>
            <CalendarDays size={16} />
            <span>
              <strong>{holiday.name}</strong>
              <small>{formatHolidayDate(holiday.date, locale)}</small>
            </span>
            <button
              className="icon-button"
              type="button"
              onClick={() => removeHoliday(holiday.id)}
              aria-label={`Remove ${holiday.name}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {holidays.length === 0 && (
          <p className="compact-empty">
            {t("No company non-working days configured yet.")}
          </p>
        )}
      </div>
    </section>
  );
}

function formatHolidayDate(value: string, locale: "uk" | "en") {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
