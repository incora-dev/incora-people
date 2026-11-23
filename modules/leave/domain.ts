export function countWorkdays(
  startValue: string,
  endValue: string,
  nonWorkingDates: ReadonlySet<string> = new Set(),
  workDays: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]),
) {
  const start = parseDateOnly(startValue);
  const end = parseDateOnly(endValue);
  if (!start || !end || end < start) return 0;

  let days = 0;
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const weekday = cursor.getUTCDay();
    const date = cursor.toISOString().slice(0, 10);
    const isoDay = weekday === 0 ? 7 : weekday;
    if (workDays.has(isoDay) && !nonWorkingDates.has(date)) {
      days += 1;
    }
  }
  return days;
}

export type LeaveDayAllocation = { date: string; amount: 0 | 0.5 | 1 };

export function validateDailyAllocations(
  startValue: string,
  endValue: string,
  allocations: readonly LeaveDayAllocation[],
  nonWorkingDates: ReadonlySet<string> = new Set(),
  workDays: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]),
) {
  const start = parseDateOnly(startValue);
  const end = parseDateOnly(endValue);
  if (!start || !end || end < start)
    return { ok: false as const, error: "invalid_range" };
  const byDate = new Map(allocations.map((item) => [item.date, item.amount]));
  const dates: LeaveDayAllocation[] = [];
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    const weekday = cursor.getUTCDay();
    const isoDay = weekday === 0 ? 7 : weekday;
    const working = workDays.has(isoDay) && !nonWorkingDates.has(date);
    const amount = byDate.get(date) ?? 0;
    if (!working && amount !== 0)
      return { ok: false as const, error: "non_working_day" };
    dates.push({ date, amount });
  }
  if (
    byDate.size !== dates.length ||
    [...byDate.keys()].some((date) => !dates.some((item) => item.date === date))
  ) {
    return { ok: false as const, error: "allocation_outside_range" };
  }
  const total = dates.reduce((sum, item) => sum + item.amount, 0);
  if (total <= 0) return { ok: false as const, error: "no_leave_days" };
  return { ok: true as const, dates, total };
}

export function roundLeaveAccrual(value: number) {
  return Math.round(value * 2) / 2;
}

export function calculateInitialAnnualAllowance(
  annualAllowance: number,
  startDate: string,
  balanceYear: number,
) {
  const start = parseDateOnly(startDate);
  if (!start || annualAllowance <= 0) return 0;
  const startYear = start.getUTCFullYear();
  if (startYear < balanceYear) return roundLeaveAccrual(annualAllowance);
  if (startYear > balanceYear) return 0;
  const month = start.getUTCMonth();
  const daysInStartMonth = new Date(
    Date.UTC(startYear, month + 1, 0),
  ).getUTCDate();
  const eligibleStartMonthDays = daysInStartMonth - start.getUTCDate() + 1;
  const remainingFullMonths = 11 - month;
  const monthlyAllowance = annualAllowance / 12;
  return roundLeaveAccrual(
    monthlyAllowance *
      (remainingFullMonths + eligibleStartMonthDays / daysInStartMonth),
  );
}

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
