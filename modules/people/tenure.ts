const DAY_MS = 86_400_000;
const YEAR_MS = 31_556_952_000;

export type TenureEmployee = {
  startDate: string;
  status: string;
  lastWorkingDay?: string | null;
};

/** A terminated employee's service stops on the recorded last working day. */
export function tenureEndDate(
  employee: Pick<TenureEmployee, "status" | "lastWorkingDay">,
  today: string,
) {
  if (
    employee.status === "inactive" &&
    employee.lastWorkingDay &&
    toUtcDay(employee.lastWorkingDay) !== null
  ) {
    return employee.lastWorkingDay;
  }
  return today;
}

export function calculateEmploymentTenureDays(
  employee: TenureEmployee,
  today: string,
) {
  const start = toUtcDay(employee.startDate);
  const end = toUtcDay(tenureEndDate(employee, today));
  if (start === null || end === null) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

export function calculateTotalExperienceDays(
  previousExperienceDays: number | null,
  employee: TenureEmployee,
  today: string,
) {
  const tenureDays = calculateEmploymentTenureDays(employee, today);
  if (previousExperienceDays === null || tenureDays === null) return null;
  return previousExperienceDays + tenureDays;
}

export function tenureYears(employee: TenureEmployee, today = localToday()) {
  const start = toUtcDay(employee.startDate);
  const end = toUtcDay(tenureEndDate(employee, today));
  if (start === null || end === null) return -1;
  if (start > end) return -1;
  return (end - start) / YEAR_MS;
}

export function formatEmployeeTenure(
  employee: TenureEmployee,
  locale: "uk" | "en",
  today = localToday(),
) {
  const start = toUtcDay(employee.startDate);
  const endDate = tenureEndDate(employee, today);
  const end = toUtcDay(endDate);
  if (start === null || end === null) return "—";
  const days = Math.floor((end - start) / DAY_MS);
  if (days < 0) {
    const amount = Math.abs(days);
    return locale === "uk"
      ? `Початок через ${amount} ${ukDays(amount)}`
      : `Starts in ${amount} ${amount === 1 ? "day" : "days"}`;
  }
  if (days < 31) {
    return locale === "uk"
      ? days === 0
        ? "Перший день"
        : `${days} ${ukDays(days)}`
      : days === 0
        ? "First day"
        : `${days} ${days === 1 ? "day" : "days"}`;
  }

  const startParts = splitDate(employee.startDate);
  const endParts = splitDate(endDate);
  if (!startParts || !endParts) return "—";
  let months =
    (endParts.year - startParts.year) * 12 + endParts.month - startParts.month;
  if (endParts.day < startParts.day) months -= 1;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (locale === "uk") {
    if (!years) return `${remainder} міс.`;
    return remainder ? `${years} р. ${remainder} міс.` : `${years} р.`;
  }
  if (!years) return `${remainder} mo`;
  return remainder ? `${years} yr ${remainder} mo` : `${years} yr`;
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toUtcDay(value: string) {
  const parts = splitDate(value);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return date.getTime();
}

function splitDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function ukDays(value: number) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "днів";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дні";
  return "днів";
}
