type DirectoryEmployee = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  startDate: string;
  status: string;
  lastWorkingDay?: string | null;
  lifecycleStatus: EmployeeLifecycleStage;
};

export type EmployeeLifecycleStage =
  "awaiting_invitation" | "working" | "probation" | "terminated" | "on_leave";

export type EmployeeDirectoryLifecycleFilter =
  "active" | "awaiting_invitation" | "terminated" | "all";
export type EmployeeDirectoryCycleFilter =
  | "all"
  | "awaiting_invitation"
  | "working"
  | "probation"
  | "on_leave"
  | "terminated";

/** Inactive employee records are visible in people discovery only to Super Admin. */
export function canViewInactiveEmployees(role: string) {
  return role === "super_admin";
}

export function getEmployeeLifecycleStage(
  status: string,
  probationEnd: string | null | undefined,
  today: string,
  invited = true,
): DirectoryEmployee["lifecycleStatus"] {
  if (status === "inactive") return "terminated";
  if (!invited) return "awaiting_invitation";
  if (status === "on_leave") return "on_leave";
  if (probationEnd && probationEnd >= today) return "probation";
  return "working";
}

/** Active means invited to the system and not terminated. */
export function isActiveLifecycleStage(stage: EmployeeLifecycleStage) {
  return stage !== "terminated" && stage !== "awaiting_invitation";
}

/**
 * People who were added but not invited yet are visible only to those who
 * manage people (HR and Super Admin). Everyone else sees them only after the
 * invitation, except the person's own profile.
 */
export function canViewNotInvitedEmployees(access: { managePeople: boolean }) {
  return access.managePeople;
}

export type EmployeeDirectorySort =
  "name-asc" | "name-desc" | "tenure-desc" | "tenure-asc";

export function filterEmployeeDirectoryItems<T extends DirectoryEmployee>(
  employees: T[],
  options: {
    query?: string;
    lifecycle?: EmployeeDirectoryLifecycleFilter;
    employmentCycle?: EmployeeDirectoryCycleFilter;
    locale: "uk" | "en";
  },
) {
  const query = options.query
    ?.trim()
    .toLocaleLowerCase(localeTag(options.locale));
  return employees.filter((employee) => {
    if (
      options.employmentCycle &&
      options.employmentCycle !== "all" &&
      employee.lifecycleStatus !== options.employmentCycle
    ) {
      return false;
    }
    if (
      options.lifecycle === "active" &&
      !isActiveLifecycleStage(employee.lifecycleStatus)
    ) {
      return false;
    }
    if (
      options.lifecycle === "awaiting_invitation" &&
      employee.lifecycleStatus !== "awaiting_invitation"
    ) {
      return false;
    }
    if (
      options.lifecycle === "terminated" &&
      employee.lifecycleStatus !== "terminated"
    ) {
      return false;
    }
    if (!query) return true;
    const searchable = [
      employee.firstName,
      employee.lastName,
      employee.email,
      employee.jobTitle,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase(localeTag(options.locale));
    return searchable.includes(query);
  });
}

export function sortEmployeeDirectoryItems<T extends DirectoryEmployee>(
  employees: T[],
  sort: EmployeeDirectorySort,
  locale: "uk" | "en",
  today: string,
  calculateTenure: (
    employee: Pick<
      DirectoryEmployee,
      "startDate" | "status" | "lastWorkingDay"
    >,
    today: string,
  ) => number,
): T[] {
  const collator = new Intl.Collator(localeTag(locale), {
    sensitivity: "base",
    numeric: true,
  });
  return [...employees].sort((left, right) => {
    if (sort === "name-asc" || sort === "name-desc") {
      const comparison = collator.compare(
        displayName(left),
        displayName(right),
      );
      if (comparison !== 0)
        return sort === "name-asc" ? comparison : -comparison;
      return left.id - right.id;
    }

    const leftTenure = calculateTenure(left, today);
    const rightTenure = calculateTenure(right, today);
    const leftKnown = leftTenure >= 0;
    const rightKnown = rightTenure >= 0;
    if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
    if (leftKnown && rightKnown && leftTenure !== rightTenure) {
      return sort === "tenure-desc"
        ? rightTenure - leftTenure
        : leftTenure - rightTenure;
    }
    const nameComparison = collator.compare(
      displayName(left),
      displayName(right),
    );
    return nameComparison || left.id - right.id;
  });
}

function displayName(employee: DirectoryEmployee) {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function localeTag(locale: "uk" | "en") {
  return locale === "uk" ? "uk-UA" : "en-GB";
}
