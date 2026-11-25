"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import {
  addCalendarDays,
  addCalendarMonths,
  calendarMonthDays,
  formatManualDate,
  parseManualDate,
} from "@/modules/people/dates";
import { getDateContext } from "@/modules/shared/date";

type CalendarPosition = { top: number; left: number };
type DateFieldError = "invalid" | "required" | "range" | null;

export function DateField({
  name,
  label,
  value = "",
  required = false,
  requiredMark = false,
  min,
  max,
  readOnly = false,
  onValueChange,
}: {
  name: string;
  label: string;
  value?: string;
  required?: boolean;
  /** Show a red asterisk after the label of a required date. */
  requiredMark?: boolean;
  min?: string;
  max?: string;
  readOnly?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const { locale, t } = useI18n();
  const today = getDateContext().today;
  const [iso, setIso] = useState(value);
  const [display, setDisplay] = useState(formatManualDate(value));
  const [error, setError] = useState<DateFieldError>(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    (value || today).slice(0, 7),
  );
  const [focusDate, setFocusDate] = useState(value || today);
  const [calendarPosition, setCalendarPosition] =
    useState<CalendarPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const previousValuePropRef = useRef(value);
  const emittedValueRef = useRef<string | null>(null);
  const suppressFocusOpen = useRef(false);
  const calendarId = `${name}-calendar`;
  const errorId = `${name}-date-error`;
  const days = calendarMonthDays(visibleMonth);
  const localeTag = locale === "uk" ? "uk-UA" : "en-GB";

  useEffect(() => {
    // Parent forms can reset or replace a value after mount (for example, when
    // editing an employee or deriving a probation date). Keep the editable
    // presentation synchronized with external values, but do not mistake the
    // parent's echo of this field's own ISO update for an external reset. In
    // particular, invalid/manual drafts emit an empty ISO value while their
    // visible text must remain available for correction.
    if (previousValuePropRef.current === value) return;
    previousValuePropRef.current = value;
    if (emittedValueRef.current === value) {
      emittedValueRef.current = null;
      return;
    }
    emittedValueRef.current = null;
    setIso(value);
    setDisplay(formatManualDate(value));
    setError(null);
    const nextDate = value || getDateContext().today;
    setVisibleMonth(nextDate.slice(0, 7));
    setFocusDate(nextDate);
    inputRef.current?.setCustomValidity("");
  }, [value]);

  function withinRange(date: string) {
    return (!min || date >= min) && (!max || date <= max);
  }

  function clampToRange(date: string) {
    if (min && date < min) return min;
    if (max && date > max) return max;
    return date;
  }

  function errorMessage(nextError: DateFieldError) {
    if (nextError === "required") return t("This date is required.");
    if (nextError === "range")
      return t("Choose a date within the allowed range.");
    return nextError === "invalid"
      ? t("Enter a valid date in DD.MM.YYYY format.")
      : "";
  }

  function notifyValueChange(nextValue: string) {
    emittedValueRef.current = nextValue;
    onValueChange?.(nextValue);
  }

  function validate(
    nextDisplay: string,
    input: HTMLInputElement,
    touched: boolean,
  ) {
    const trimmed = nextDisplay.trim();
    setDisplay(nextDisplay);

    if (!trimmed) {
      setIso("");
      setError(touched && required ? "required" : null);
      input.setCustomValidity(
        touched && required ? errorMessage("required") : "",
      );
      notifyValueChange("");
      return;
    }

    const parsed = parseManualDate(trimmed);
    if (parsed && !withinRange(parsed)) {
      setIso("");
      setError("range");
      input.setCustomValidity(errorMessage("range"));
      notifyValueChange("");
      return;
    }
    if (parsed) {
      setIso(parsed);
      setError(null);
      input.setCustomValidity("");
      setVisibleMonth(parsed.slice(0, 7));
      setFocusDate(parsed);
      notifyValueChange(parsed);
      return;
    }

    setIso("");
    notifyValueChange("");
    const complete = /^\d{2}\.\d{2}\.\d{4}$/.test(trimmed);
    const nextError = touched || complete ? "invalid" : null;
    setError(nextError);
    input.setCustomValidity(errorMessage(nextError));
  }

  function initialCalendarDate() {
    const parsed = parseManualDate(display) || iso || today;
    return clampToRange(parsed);
  }

  function openCalendar() {
    if (readOnly) return;
    const date = initialCalendarDate();
    setFocusDate(date);
    setVisibleMonth(date.slice(0, 7));
    setOpen(true);
  }

  const placeCalendar = useCallback(() => {
    const input = inputRef.current;
    const calendar = calendarRef.current;
    if (!input || !calendar) return;
    const field = input.getBoundingClientRect();
    const panel = calendar.getBoundingClientRect();
    const panelHeight = panel.height || 328;
    const panelWidth = panel.width || 296;
    const top =
      window.innerHeight - field.bottom >= panelHeight + 8
        ? field.bottom + 6
        : Math.max(8, field.top - panelHeight - 6);
    const left = Math.max(
      8,
      Math.min(field.left, window.innerWidth - panelWidth - 8),
    );
    setCalendarPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    placeCalendar();
  }, [open, visibleMonth, placeCalendar]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !calendarRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !calendarRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      suppressFocusOpen.current = true;
      inputRef.current?.focus();
      requestAnimationFrame(() => {
        suppressFocusOpen.current = false;
      });
    };
    const onViewportChange = () => placeCalendar();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, placeCalendar]);

  function focusCalendarDate(date: string) {
    if (!withinRange(date)) return;
    setFocusDate(date);
    setVisibleMonth(date.slice(0, 7));
    requestAnimationFrame(() => {
      calendarRef.current
        ?.querySelector<HTMLButtonElement>(`[data-calendar-day="${date}"]`)
        ?.focus();
    });
  }

  function moveMonth(amount: number) {
    const next =
      addCalendarMonths(focusDate, amount) ||
      addCalendarMonths(`${visibleMonth}-01`, amount);
    if (!next) return;
    focusCalendarDate(clampToRange(next));
  }

  function chooseDate(date: string) {
    if (!withinRange(date)) return;
    const nextDisplay = formatManualDate(date);
    setIso(date);
    setDisplay(nextDisplay);
    setError(null);
    inputRef.current?.setCustomValidity("");
    notifyValueChange(date);
    setOpen(false);
    suppressFocusOpen.current = true;
    inputRef.current?.focus();
    requestAnimationFrame(() => {
      suppressFocusOpen.current = false;
    });
  }

  function onManualKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" && open) {
      event.preventDefault();
      focusCalendarDate(focusDate);
    }
    if (event.key === "Enter") {
      // Implicit form submission can happen without a blur event. Validate
      // synchronously so a partial/invalid date never submits an empty ISO value.
      validate(event.currentTarget.value, event.currentTarget, true);
    }
  }

  function onCalendarDayKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    date: string,
  ) {
    const moveBy = (amount: number) => {
      event.preventDefault();
      const next = addCalendarDays(date, amount);
      if (next) focusCalendarDate(next);
    };
    if (event.key === "ArrowLeft") moveBy(-1);
    else if (event.key === "ArrowRight") moveBy(1);
    else if (event.key === "ArrowUp") moveBy(-7);
    else if (event.key === "ArrowDown") moveBy(7);
    else if (event.key === "PageUp") {
      event.preventDefault();
      const next = addCalendarMonths(date, event.shiftKey ? -12 : -1);
      if (next) focusCalendarDate(next);
    } else if (event.key === "PageDown") {
      event.preventDefault();
      const next = addCalendarMonths(date, event.shiftKey ? 12 : 1);
      if (next) focusCalendarDate(next);
    } else if (event.key === "Home" || event.key === "End") {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const offsetFromMonday = (weekday + 6) % 7;
      moveBy(event.key === "Home" ? -offsetFromMonday : 6 - offsetFromMonday);
    }
  }

  const monthParts = /^(\d{4})-(\d{2})$/.exec(visibleMonth);
  const monthDate = monthParts
    ? new Date(Date.UTC(Number(monthParts[1]), Number(monthParts[2]) - 1, 1))
    : new Date();
  const monthLabel = new Intl.DateTimeFormat(localeTag, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthDate);
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, 1 + index));
    return new Intl.DateTimeFormat(localeTag, {
      weekday: "short",
      timeZone: "UTC",
    }).format(date);
  });
  const errorText = errorMessage(error);
  const rows = Array.from({ length: 6 }, (_, row) =>
    days.slice(row * 7, row * 7 + 7),
  );

  return (
    <div className="date-field" ref={rootRef}>
      <label htmlFor={`${name}-manual`}>
        {label}
        {requiredMark && (
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="date-field-controls">
        <input type="hidden" name={name} value={iso} />
        <input
          id={`${name}-manual`}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="ДД.ММ.РРРР"
          value={display}
          required={required}
          readOnly={readOnly}
          aria-readonly={readOnly || undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? errorId : undefined}
          aria-haspopup={readOnly ? undefined : "dialog"}
          aria-expanded={readOnly ? undefined : open}
          aria-controls={readOnly ? undefined : calendarId}
          onFocus={() => {
            if (!suppressFocusOpen.current) openCalendar();
          }}
          onClick={openCalendar}
          onKeyDown={onManualKeyDown}
          onInvalid={(event) => {
            event.preventDefault();
            const trimmed = display.trim();
            const parsed = parseManualDate(trimmed);
            const nextError: DateFieldError = !trimmed
              ? "required"
              : parsed && !withinRange(parsed)
                ? "range"
                : "invalid";
            setError(nextError);
            event.currentTarget.setCustomValidity(errorMessage(nextError));
          }}
          onChange={(event) =>
            validate(event.target.value, event.currentTarget, false)
          }
          onBlur={(event) =>
            validate(
              event.currentTarget.value.trim(),
              event.currentTarget,
              true,
            )
          }
        />
        {!readOnly && (
          <button
            type="button"
            className="date-field-picker"
            aria-label={t("Choose date")}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={calendarId}
            onClick={() => (open ? setOpen(false) : openCalendar())}
          >
            <CalendarDays size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {error && (
        <small id={errorId} className="form-error" role="alert">
          {errorText}
        </small>
      )}
      {!readOnly &&
        open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={calendarId}
            ref={calendarRef}
            className="date-field-calendar"
            role="dialog"
            aria-label={t("Choose date")}
            style={{
              top: calendarPosition?.top ?? 0,
              left: calendarPosition?.left ?? 0,
              visibility: calendarPosition ? "visible" : "hidden",
            }}
          >
            <div className="date-field-calendar-heading">
              <button
                type="button"
                className="icon-button"
                aria-label={t("Previous month")}
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <strong aria-live="polite">{monthLabel}</strong>
              <button
                type="button"
                className="icon-button"
                aria-label={t("Next month")}
                onClick={() => moveMonth(1)}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
            <div
              className="date-field-calendar-grid"
              role="grid"
              aria-label={monthLabel}
            >
              <div
                className="date-field-calendar-row date-field-calendar-weekdays"
                role="row"
              >
                {weekdayLabels.map((weekday, index) => (
                  <span role="columnheader" key={`${weekday}-${index}`}>
                    {weekday}
                  </span>
                ))}
              </div>
              {rows.map((week, rowIndex) => (
                <div
                  className="date-field-calendar-row"
                  role="row"
                  key={rowIndex}
                >
                  {week.map((date) => {
                    const inMonth = date.slice(0, 7) === visibleMonth;
                    const disabled = !withinRange(date);
                    const accessibleDate = new Intl.DateTimeFormat(localeTag, {
                      dateStyle: "full",
                      timeZone: "UTC",
                    }).format(new Date(`${date}T12:00:00Z`));
                    return (
                      <button
                        type="button"
                        role="gridcell"
                        key={date}
                        data-calendar-day={date}
                        tabIndex={focusDate === date ? 0 : -1}
                        aria-label={accessibleDate}
                        aria-selected={iso === date}
                        aria-current={today === date ? "date" : undefined}
                        aria-disabled={disabled || undefined}
                        disabled={disabled}
                        className={[
                          "date-field-calendar-day",
                          !inMonth ? "outside-month" : "",
                          iso === date ? "selected" : "",
                          today === date ? "today" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => chooseDate(date)}
                        onKeyDown={(event) => onCalendarDayKeyDown(event, date)}
                      >
                        {Number(date.slice(8, 10))}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
