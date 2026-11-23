const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

export function addCalendarMonths(date: string, months: number) {
  const match = ISO_DATE.exec(date);
  if (!match || !Number.isInteger(months)) return "";
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const original = new Date(Date.UTC(year, month, day));
  if (
    original.getUTCFullYear() !== year ||
    original.getUTCMonth() !== month ||
    original.getUTCDate() !== day
  ) {
    return "";
  }
  const targetMonthStart = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(day, lastDay));
  return targetMonthStart.toISOString().slice(0, 10);
}

export function resolveProbationEnd(
  startDate: string,
  explicitDate: string | undefined,
  probationMonths: number,
) {
  if (explicitDate !== undefined) return explicitDate || null;
  return addCalendarMonths(startDate, probationMonths) || null;
}

export function parseManualDate(value: string) {
  const match = LOCAL_DATE.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const iso = `${yyyy}-${mm}-${dd}`;
  return addCalendarMonths(iso, 0) === iso ? iso : null;
}

export function formatManualDate(value: string) {
  const match = ISO_DATE.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

/** Add calendar days to a date-only value without involving local time zones. */
export function addCalendarDays(date: string, days: number) {
  const match = ISO_DATE.exec(date);
  if (!match || !Number.isInteger(days)) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const cursor = new Date(0);
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCFullYear(year, month - 1, day);
  if (
    cursor.getUTCFullYear() !== year ||
    cursor.getUTCMonth() !== month - 1 ||
    cursor.getUTCDate() !== day
  ) {
    return "";
  }
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return `${String(cursor.getUTCFullYear()).padStart(4, "0")}-${String(
    cursor.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`;
}

/** Return a Monday-first six-week calendar grid for an ISO month key. */
export function calendarMonthDays(monthKey: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) return [] as string[];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const first = new Date(0);
  first.setUTCHours(0, 0, 0, 0);
  first.setUTCFullYear(year, month - 1, 1);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const gridStart = addCalendarDays(`${monthKey}-01`, -mondayOffset);
  if (!gridStart) return [] as string[];
  return Array.from({ length: 42 }, (_, index) =>
    addCalendarDays(gridStart, index),
  );
}
