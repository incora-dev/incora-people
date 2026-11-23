export type DateContext = {
  today: string;
  year: number;
  month: number;
  monthKey: string;
  monthStart: string;
  monthEnd: string;
};

/**
 * Format a browser/runtime-local calendar date without converting it to UTC.
 * Use this for date-only input defaults; timestamps must continue to use ISO UTC.
 */
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getDateContext(
  now = new Date(),
  timeZone = "Europe/Kyiv",
): DateContext {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = value("day");
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    today: `${monthKey}-${day}`,
    year,
    month,
    monthKey,
    monthStart: `${monthKey}-01`,
    monthEnd: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function yearFromDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? Number(value.slice(0, 4)) : null;
}

/** Return the calendar date represented by a UTC timestamp in a timezone. */
export function dateKeyInTimeZone(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
}

/** Return true only for an IANA timezone understood by the runtime. */
export function isValidTimeZone(timeZone: string) {
  if (!timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * Return canonical local-date and UTC boundaries for a calendar month.
 * Persisted timestamps are UTC, while HR periods are selected in the
 * workspace timezone; using this helper prevents month-edge records from
 * being assigned to the wrong period during DST or positive UTC offsets.
 */
export function getMonthDateRange(month: string, timeZone = "Europe/Kyiv") {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const monthStart = `${month}-01`;
  const nextMonthDate = new Date(Date.UTC(year, monthNumber, 1));
  const nextMonth = `${nextMonthDate.getUTCFullYear()}-${String(
    nextMonthDate.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  const utcStart = zonedDateTimeToUtc(monthStart, "00:00:00", timeZone);
  const utcEnd = zonedDateTimeToUtc(`${nextMonth}-01`, "00:00:00", timeZone);
  if (!utcStart || !utcEnd) return null;
  return {
    month,
    monthStart,
    monthEnd,
    utcStart: utcStart.toISOString(),
    utcEnd: utcEnd.toISOString(),
  };
}

/** Return all local reporting months touched by a half-open UTC interval. */
export function monthKeysForInterval(
  start: string,
  end: string | null,
  timeZone: string,
) {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate.getTime() <= startDate.getTime()
  ) {
    return [] as string[];
  }
  const startKey = dateKeyInTimeZone(startDate.toISOString(), timeZone)?.slice(
    0,
    7,
  );
  const lastIncludedInstant = new Date(endDate.getTime() - 1).toISOString();
  const endKey = dateKeyInTimeZone(lastIncludedInstant, timeZone)?.slice(0, 7);
  if (!startKey || !endKey) return [] as string[];

  const [startYear, startMonth] = startKey.split("-").map(Number);
  const [endYear, endMonth] = endKey.split("-").map(Number);
  let cursor = startYear * 12 + startMonth - 1;
  const last = endYear * 12 + endMonth - 1;
  const result: string[] = [];
  while (cursor <= last && result.length < 240) {
    const year = Math.floor(cursor / 12);
    const month = (cursor % 12) + 1;
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    cursor += 1;
  }
  return result;
}

/** Return canonical UTC boundaries for one local calendar day. */
export function getDayDateRange(date: string, timeZone = "Europe/Kyiv") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const current = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(current.getTime())) return null;
  current.setUTCDate(current.getUTCDate() + 1);
  const nextDate = current.toISOString().slice(0, 10);
  const utcStart = zonedDateTimeToUtc(date, "00:00:00", timeZone);
  const utcEnd = zonedDateTimeToUtc(nextDate, "00:00:00", timeZone);
  if (!utcStart || !utcEnd) return null;
  return {
    date,
    utcStart: utcStart.toISOString(),
    utcEnd: utcEnd.toISOString(),
  };
}

/** Return UTC boundaries for the Monday–Sunday week containing a local date. */
export function getWeekDateRange(date: string, timeZone = "Europe/Kyiv") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const cursor = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return null;
  const mondayOffset = isoWeekday(cursor.getUTCDay()) - 1;
  cursor.setUTCDate(cursor.getUTCDate() - mondayOffset);
  const monday = cursor.toISOString().slice(0, 10);
  cursor.setUTCDate(cursor.getUTCDate() + 7);
  const nextMonday = cursor.toISOString().slice(0, 10);
  const start = getDayDateRange(monday, timeZone);
  const end = getDayDateRange(nextMonday, timeZone);
  if (!start || !end) return null;
  return {
    weekStart: monday,
    weekEnd: nextMonday,
    utcStart: start.utcStart,
    utcEnd: end.utcStart,
  };
}

/** Convert JavaScript Sunday=0 weekdays to the ISO schedule convention 1..7. */
export function isoWeekday(weekday: number) {
  return weekday === 0 ? 7 : weekday;
}

export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match || !timeMatch) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? 0);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const guessedDate = new Date(utcGuess);
  if (
    guessedDate.getUTCFullYear() !== year ||
    guessedDate.getUTCMonth() !== month - 1 ||
    guessedDate.getUTCDate() !== day
  ) {
    return null;
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const offsetAt = (timestamp: number) => {
      const values = Object.fromEntries(
        formatter
          .formatToParts(new Date(timestamp))
          .filter((part) => part.type !== "literal")
          .map((part) => [part.type, Number(part.value)]),
      ) as Record<string, number>;
      return (
        Date.UTC(
          values.year,
          values.month - 1,
          values.day,
          values.hour,
          values.minute,
          values.second,
        ) - timestamp
      );
    };
    let timestamp = utcGuess - offsetAt(utcGuess);
    timestamp = utcGuess - offsetAt(timestamp);
    const result = new Date(timestamp);
    const actual = Object.fromEntries(
      formatter
        .formatToParts(result)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<string, number>;
    return actual.year === year &&
      actual.month === month &&
      actual.day === day &&
      actual.hour === hour &&
      actual.minute === minute &&
      actual.second === second
      ? result
      : null;
  } catch {
    return null;
  }
}

/**
 * Converts either an ISO timestamp with an explicit offset or a browser
 * datetime-local value into one canonical UTC timestamp.
 */
export function normalizeDateTime(value: string, timeZone: string) {
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)$/.exec(value);
  return match
    ? (zonedDateTimeToUtc(match[1], match[2], timeZone)?.toISOString() ?? null)
    : null;
}

/** Format an instant in the employee's resolved timezone, independent of the runtime. */
export function formatTimeInZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}
