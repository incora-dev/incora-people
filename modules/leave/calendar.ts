export type LeaveCalendarEvent = {
  id: number;
  employeeId: number;
  firstName: string;
  lastName: string;
  department: string;
  typeName: string;
  color: string;
  startDate: string;
  endDate: string;
  days: number;
};

export type LeaveCalendarPerson = {
  employeeId: number;
  firstName: string;
  lastName: string;
  department: string;
  absences: LeaveCalendarEvent[];
};

/**
 * Calendar rows represent people, not leave-request rows. A person may have
 * several approved absences in the visible month; keep those intervals under
 * one stable row so the directory does not show the same employee repeatedly.
 */
export function groupLeaveCalendarEvents(
  events: readonly LeaveCalendarEvent[],
): LeaveCalendarPerson[] {
  const grouped = new Map<number, LeaveCalendarPerson>();
  for (const event of events) {
    const existing = grouped.get(event.employeeId);
    if (existing) {
      existing.absences.push(event);
      continue;
    }
    grouped.set(event.employeeId, {
      employeeId: event.employeeId,
      firstName: event.firstName,
      lastName: event.lastName,
      department: event.department,
      absences: [event],
    });
  }
  return [...grouped.values()];
}
