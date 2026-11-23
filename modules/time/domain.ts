export type TimeInterval = {
  start: Date;
  end: Date;
};

export function parseTimeInterval(
  startValue: string,
  endValue: string,
  maximumHours = 24,
): TimeInterval | null {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const duration = end.getTime() - start.getTime();
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    duration <= 0 ||
    duration > maximumHours * 60 * 60 * 1000
  ) {
    return null;
  }
  return { start, end };
}

export function intervalsOverlap(left: TimeInterval, right: TimeInterval) {
  return left.start < right.end && right.start < left.end;
}

/** Return true when an open or closed UTC interval intersects a reporting range. */
export function intervalIntersectsRange(
  startValue: string,
  endValue: string | null,
  range: { utcStart: string; utcEnd: string },
) {
  const start = new Date(startValue).getTime();
  const end = endValue
    ? new Date(endValue).getTime()
    : Number.POSITIVE_INFINITY;
  const rangeStart = new Date(range.utcStart).getTime();
  const rangeEnd = new Date(range.utcEnd).getTime();
  return (
    Number.isFinite(start) &&
    Number.isFinite(rangeStart) &&
    Number.isFinite(rangeEnd) &&
    start < rangeEnd &&
    end > rangeStart
  );
}

/** Duration of a closed interval clipped to a UTC reporting range. */
export function clippedDurationMinutes(
  startValue: string,
  endValue: string | null,
  range: { utcStart: string; utcEnd: string },
) {
  if (!endValue) return 0;
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  const rangeStart = new Date(range.utcStart).getTime();
  const rangeEnd = new Date(range.utcEnd).getTime();
  if (![start, end, rangeStart, rangeEnd].every(Number.isFinite)) return 0;
  return Math.max(
    0,
    Math.round((Math.min(end, rangeEnd) - Math.max(start, rangeStart)) / 60000),
  );
}

/** Net worked minutes for a closed entry, excluding all recorded breaks. */
export function netDurationMinutes(
  entry: { id: number; clockIn: string; clockOut: string | null },
  breaks: { timeEntryId: number; startedAt: string; endedAt: string | null }[],
) {
  if (!entry.clockOut) return 0;
  const start = new Date(entry.clockIn).getTime();
  const end = new Date(entry.clockOut).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return 0;
  const breakMinutes = breaks
    .filter((item) => item.timeEntryId === entry.id && item.endedAt)
    .reduce((total, item) => {
      const breakStart = Math.max(start, new Date(item.startedAt).getTime());
      const breakEnd = Math.min(end, new Date(item.endedAt!).getTime());
      return total + Math.max(0, Math.round((breakEnd - breakStart) / 60000));
    }, 0);
  return Math.max(0, Math.round((end - start) / 60000) - breakMinutes);
}

/** Net duration clipped to a reporting period in UTC. */
export function netDurationMinutesClipped(
  entry: { id: number; clockIn: string; clockOut: string | null },
  breaks: { timeEntryId: number; startedAt: string; endedAt: string | null }[],
  range: { utcStart: string; utcEnd: string },
) {
  if (!entry.clockOut) return 0;
  const grossMinutes = clippedDurationMinutes(
    entry.clockIn,
    entry.clockOut,
    range,
  );
  if (!grossMinutes) return 0;
  const rangeStart = new Date(range.utcStart).getTime();
  const rangeEnd = new Date(range.utcEnd).getTime();
  const start = Math.max(
    new Date(entry.clockIn).getTime(),
    new Date(range.utcStart).getTime(),
  );
  const end = Math.min(
    new Date(entry.clockOut).getTime(),
    new Date(range.utcEnd).getTime(),
  );
  const breakMinutes = breaks
    .filter((item) => item.timeEntryId === entry.id && item.endedAt)
    .reduce((total, item) => {
      const breakStart = Math.max(
        start,
        rangeStart,
        new Date(item.startedAt).getTime(),
      );
      const breakEnd = Math.min(
        end,
        rangeEnd,
        new Date(item.endedAt!).getTime(),
      );
      return total + Math.max(0, Math.round((breakEnd - breakStart) / 60000));
    }, 0);
  return Math.max(0, grossMinutes - breakMinutes);
}

export function monthFromTimestamp(value: string) {
  const match = /^(\d{4}-(?:0[1-9]|1[0-2]))/.exec(value);
  return match?.[1] ?? null;
}

export function classifyWorkday(input: {
  date: string;
  today: string;
  workedMinutes: number;
  expectedMinutes: number;
  scheduled: boolean;
  holiday: boolean;
  absenceAmount: number;
}) {
  if (input.holiday) return "holiday" as const;
  if (!input.scheduled) return "weekend" as const;
  const expected = Math.round(
    input.expectedMinutes * (1 - Math.min(1, Math.max(0, input.absenceAmount))),
  );
  if (expected === 0 && input.absenceAmount > 0) return "absence" as const;
  if (expected > 0 && input.workedMinutes >= expected)
    return "complete" as const;
  if (input.date < input.today && input.workedMinutes < expected)
    return "underworked" as const;
  return "open" as const;
}
