type DatedExperience = { startedOn: string | null; endedOn: string | null };
type EmploymentSnapshot = {
  id: number;
  effectiveDate: string;
  jobTitle: string;
  level: string | null;
  managerId: number | null;
  location: string;
  division: string;
  department: string;
  team: string | null;
  employmentType: string;
  status: string;
  changeReason: string;
};

type EmploymentState = Omit<
  EmploymentSnapshot,
  "id" | "effectiveDate" | "changeReason"
>;

type MeaningfulEmploymentState = Pick<
  EmploymentState,
  | "jobTitle"
  | "level"
  | "managerId"
  | "location"
  | "division"
  | "department"
  | "team"
  | "employmentType"
  | "status"
>;

export type EmploymentTimelineItem =
  | { kind: "hired"; date: string; state: EmploymentState }
  | { kind: "probation"; date: string }
  | { kind: "change"; date: string; state: EmploymentSnapshot }
  | {
      kind: "termination";
      date: string;
      terminationType: string | null;
      state?: EmploymentSnapshot;
    };

const DAY_MS = 86_400_000;

export function calculatePreviousExperienceDays(
  records: DatedExperience[],
  employmentStartDate: string,
) {
  const boundary = toUtcDay(employmentStartDate);
  if (boundary === null) return null;
  const intervals = records
    .map((record) => {
      const start = record.startedOn ? toUtcDay(record.startedOn) : null;
      const end = record.endedOn ? toUtcDay(record.endedOn) : boundary;
      if (start === null || end === null || start >= boundary) return null;
      const clippedEnd = Math.min(end, boundary);
      return clippedEnd > start ? ([start, clippedEnd] as const) : null;
    })
    .filter((range): range is readonly [number, number] => range !== null)
    .sort((a, b) => a[0] - b[0]);
  if (intervals.length === 0) return null;
  let total = 0;
  let [start, end] = intervals[0];
  for (const next of intervals.slice(1)) {
    if (next[0] <= end) end = Math.max(end, next[1]);
    else {
      total += end - start;
      [start, end] = next;
    }
  }
  total += end - start;
  return Math.floor(total / DAY_MS);
}

export function formatExperienceDays(days: number, locale: "uk" | "en") {
  const months = Math.floor(days / 30.4375);
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (locale === "uk") {
    const yearLabel =
      years === 1 ? "рік" : years > 1 && years < 5 ? "роки" : "років";
    const monthLabel =
      remainingMonths === 1
        ? "місяць"
        : remainingMonths > 1 && remainingMonths < 5
          ? "місяці"
          : "місяців";
    if (!years) return `${remainingMonths} ${monthLabel}`;
    return remainingMonths
      ? `${years} ${yearLabel} ${remainingMonths} ${monthLabel}`
      : `${years} ${yearLabel}`;
  }
  if (!years)
    return `${remainingMonths} ${remainingMonths === 1 ? "month" : "months"}`;
  return remainingMonths
    ? `${years} ${years === 1 ? "year" : "years"} ${remainingMonths} ${remainingMonths === 1 ? "month" : "months"}`
    : `${years} ${years === 1 ? "year" : "years"}`;
}

export function employmentStateKey(snapshot: EmploymentSnapshot) {
  return JSON.stringify([
    snapshot.jobTitle,
    snapshot.level,
    snapshot.managerId,
    snapshot.location,
    snapshot.division,
    snapshot.department,
    snapshot.team,
    snapshot.employmentType,
    snapshot.status,
  ]);
}

export function hasEmploymentStateChanged(
  current: MeaningfulEmploymentState,
  next: MeaningfulEmploymentState,
) {
  return (
    employmentStateKey({
      ...current,
      id: 0,
      effectiveDate: "",
      changeReason: "",
    }) !==
    employmentStateKey({ ...next, id: 0, effectiveDate: "", changeReason: "" })
  );
}

export function genericProfileStartDateChanged(
  currentStartDate: string,
  requestedStartDate: string | undefined,
) {
  return (
    requestedStartDate !== undefined && requestedStartDate !== currentStartDate
  );
}

export function collapseEmploymentSnapshots<T extends EmploymentSnapshot>(
  snapshots: T[],
) {
  const chronological = [...snapshots].sort(
    (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id - b.id,
  );
  const result: T[] = [];
  let previous: string | null = null;
  for (const snapshot of chronological) {
    const current = employmentStateKey(snapshot);
    if (current !== previous) result.push(snapshot);
    previous = current;
  }
  return result;
}

export function latestEmploymentStateChangeDate<T extends EmploymentSnapshot>(
  snapshots: T[],
  fallback: string,
) {
  const collapsed = collapseEmploymentSnapshots(snapshots).filter(
    (snapshot) =>
      snapshot.status !== "inactive" && !isTerminationSnapshot(snapshot),
  );
  const latest = collapsed.at(-1)?.effectiveDate;
  return latest && (collapsed.length > 1 || latest > fallback)
    ? latest
    : fallback;
}

export function employmentChangeConflict(input: {
  status: string;
  effectiveDate: string;
  latestStateChangeDate: string;
}) {
  if (input.status === "inactive") return "inactive" as const;
  if (input.effectiveDate < input.latestStateChangeDate)
    return "backdated" as const;
  return null;
}

/**
 * Normalize employment_history and the structured termination record into one
 * display timeline. The history row created by offboarding remains in storage,
 * but when employee_terminations exists it is represented only by that
 * structured record.
 */
export function buildEmploymentTimeline<T extends EmploymentSnapshot>(input: {
  startDate: string;
  probationEnd?: string | null;
  currentState: EmploymentState;
  snapshots: T[];
  termination?: { lastWorkingDay: string; terminationType: string } | null;
  terminations?: Array<{ lastWorkingDay: string; terminationType: string }>;
}): EmploymentTimelineItem[] {
  const collapsed = collapseEmploymentSnapshots(input.snapshots);
  const hireSnapshots = collapsed.filter(isHireSnapshot);
  const uniqueHireDates = [
    ...new Set([
      input.startDate,
      ...hireSnapshots.map((snapshot) => snapshot.effectiveDate),
    ]),
  ].sort();
  const hiredSnapshotIds = new Set<number>();
  const items: EmploymentTimelineItem[] = uniqueHireDates.map((date) => {
    const hiredSnapshot =
      hireSnapshots.find((snapshot) => snapshot.effectiveDate === date) ??
      (date === input.startDate
        ? collapsed.find(
            (snapshot) =>
              snapshot.effectiveDate === date &&
              !isTerminationSnapshot(snapshot),
          )
        : undefined);
    if (hiredSnapshot) hiredSnapshotIds.add(hiredSnapshot.id);
    const hiredState =
      hiredSnapshot ??
      (date === input.startDate
        ? (hireSnapshots[0] ?? input.currentState)
        : input.currentState);
    return {
      kind: "hired",
      date,
      state: {
        jobTitle: hiredState.jobTitle,
        level: hiredState.level,
        managerId: hiredState.managerId,
        location: hiredState.location,
        division: hiredState.division,
        department: hiredState.department,
        team: hiredState.team,
        employmentType: hiredState.employmentType,
        status: hiredState.status,
      },
    };
  });
  if (input.probationEnd) {
    items.push({ kind: "probation", date: input.probationEnd });
  }

  const terminationSnapshots = collapsed.filter(isTerminationSnapshot);
  for (const snapshot of collapsed) {
    if (hiredSnapshotIds.has(snapshot.id)) continue;
    if (isTerminationSnapshot(snapshot)) continue;
    items.push({
      kind: "change",
      date: snapshot.effectiveDate,
      state: snapshot,
    });
  }

  const structuredTerminations =
    input.terminations ?? (input.termination ? [input.termination] : []);
  const structuredTerminationDates = new Set(
    structuredTerminations.map((termination) => termination.lastWorkingDay),
  );
  for (const termination of structuredTerminations) {
    items.push({
      kind: "termination",
      date: termination.lastWorkingDay,
      terminationType: termination.terminationType,
    });
  }
  for (const snapshot of terminationSnapshots) {
    if (!structuredTerminationDates.has(snapshot.effectiveDate)) {
      items.push({
        kind: "termination",
        date: snapshot.effectiveDate,
        terminationType: terminationTypeFromChangeReason(snapshot.changeReason),
        state: snapshot,
      });
    }
  }

  const order = { termination: 0, change: 1, probation: 2, hired: 3 };
  return items.sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      order[left.kind] - order[right.kind],
  );
}

function isHireSnapshot(snapshot: EmploymentSnapshot) {
  return (
    snapshot.changeReason === "Employee created" ||
    snapshot.changeReason === "Employee rehired"
  );
}

function isTerminationSnapshot(snapshot: EmploymentSnapshot) {
  return (
    snapshot.status === "inactive" ||
    snapshot.changeReason.toLowerCase().startsWith("employment ended:")
  );
}

function terminationTypeFromChangeReason(changeReason: string) {
  const prefix = "Employment ended:";
  return changeReason.toLowerCase().startsWith(prefix.toLowerCase())
    ? changeReason.slice(prefix.length).trim() || null
    : null;
}

function toUtcDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date.getTime();
}
