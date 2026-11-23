export type OneOnOnePlanScope = {
  employeeId: number;
  facilitatorEmail: string;
};

export type OneOnOnePersonScope = {
  id: number;
  managerId: number | null;
};

export function filterVisibleOneOnOnePlans<TPlan extends OneOnOnePlanScope>(
  plans: TPlan[],
  people: OneOnOnePersonScope[],
  options: {
    managePeople: boolean;
    email: string;
    employeeId: number | null;
  },
) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  return plans.filter((plan) => {
    // A historical plan may outlive the employee's active status. An orphaned
    // plan must be ignored instead of crashing the server-rendered page.
    const person = peopleById.get(plan.employeeId);
    if (!person) return false;
    return (
      options.managePeople ||
      plan.facilitatorEmail === options.email ||
      plan.employeeId === options.employeeId ||
      person.managerId === options.employeeId
    );
  });
}

export type OneOnOneScheduleMode = "planned" | "overdue";
export type OneOnOneSchedule = {
  id: number;
  active: boolean | number;
  dueAt: string;
};

export type OneOnOneDirectoryPlanFilter = "all" | "has-plan" | "no-plan";
export type OneOnOneDirectorySort =
  "name-asc" | "name-desc" | "date-asc" | "date-desc";

export type OneOnOneDirectoryPerson = {
  id: number;
  firstName: string;
  lastName: string;
  nextDueDate: string | null;
};

export function filterAndSortOneOnOneDirectory<
  TPerson extends OneOnOneDirectoryPerson,
  TPlan extends OneOnOneSchedule & { employeeId: number },
>(
  people: TPerson[],
  plans: TPlan[],
  options: {
    query: string;
    planFilter: OneOnOneDirectoryPlanFilter;
    sort: OneOnOneDirectorySort;
    selectedDay: string | null;
    locale: string;
  },
) {
  const activePlansByEmployee = new Map<number, TPlan[]>();
  for (const plan of plans.filter((entry) => entry.active)) {
    activePlansByEmployee.set(plan.employeeId, [
      ...(activePlansByEmployee.get(plan.employeeId) ?? []),
      plan,
    ]);
  }

  const query = options.query.trim().toLocaleLowerCase(options.locale);
  return people
    .filter((person) => {
      const activePlans = activePlansByEmployee.get(person.id) ?? [];
      if (options.planFilter === "has-plan" && !activePlans.length)
        return false;
      if (options.planFilter === "no-plan" && activePlans.length) return false;
      if (
        options.selectedDay &&
        !activePlans.some((plan) => plan.dueAt === options.selectedDay)
      )
        return false;
      const name = `${person.firstName} ${person.lastName}`.toLocaleLowerCase(
        options.locale,
      );
      return !query || name.includes(query);
    })
    .sort((left, right) => {
      if (options.sort === "date-asc" || options.sort === "date-desc") {
        const leftDate = left.nextDueDate;
        const rightDate = right.nextDueDate;
        if (!leftDate && rightDate) return 1;
        if (leftDate && !rightDate) return -1;
        if (leftDate && rightDate) {
          const byDate = leftDate.localeCompare(rightDate);
          if (byDate) return options.sort === "date-asc" ? byDate : -byDate;
        }
      }

      const byName = `${left.firstName} ${left.lastName}`.localeCompare(
        `${right.firstName} ${right.lastName}`,
        options.locale,
      );
      const stableNameOrder = byName || left.id - right.id;
      return options.sort === "name-desc" ? -stableNameOrder : stableNameOrder;
    });
}

/** The calendar uses the persisted/derived due-by day, never a fabricated time. */
export function classifyOneOnOnePlan(
  plan: OneOnOneSchedule,
  today: string,
): OneOnOneScheduleMode | null {
  if (!plan.active || !/^\d{4}-\d{2}-\d{2}$/.test(plan.dueAt)) return null;
  return plan.dueAt < today ? "overdue" : "planned";
}

export function filterOneOnOnePlansForCalendar<TPlan extends OneOnOneSchedule>(
  plans: TPlan[],
  mode: OneOnOneScheduleMode,
  today: string,
) {
  return plans
    .filter((plan) => classifyOneOnOnePlan(plan, today) === mode)
    .sort(
      (left, right) =>
        left.dueAt.localeCompare(right.dueAt) || left.id - right.id,
    );
}

export function filterOneOnOnePlansByDay<TPlan extends OneOnOneSchedule>(
  plans: TPlan[],
  selectedDay: string | null,
) {
  return selectedDay
    ? plans.filter((plan) => plan.dueAt === selectedDay)
    : plans;
}

export function countOneOnOnePlansByDay(plans: OneOnOneSchedule[]) {
  const counts = new Map<string, number>();
  for (const plan of plans) {
    counts.set(plan.dueAt, (counts.get(plan.dueAt) ?? 0) + 1);
  }
  return counts;
}

export function sortOneOnOneConversations<
  T extends { id: number; createdAt: string },
>(items: T[], direction: "newest" | "oldest" = "newest") {
  return [...items].sort((left, right) => {
    const byCreated = left.createdAt.localeCompare(right.createdAt);
    const byId = left.id - right.id;
    return direction === "newest" ? -(byCreated || byId) : byCreated || byId;
  });
}

export function canReadConversationNote(
  note: { authorUserId: number; recipientUserIds: number[] },
  viewerUserId: number | null,
) {
  return (
    viewerUserId !== null &&
    (note.authorUserId === viewerUserId ||
      note.recipientUserIds.includes(viewerUserId))
  );
}
