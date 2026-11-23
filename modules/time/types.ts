export type TimeEntryDto = {
  id: number;
  employeeId: number;
  projectId: number | null;
  timeCode: string;
  clockIn: string;
  clockOut: string | null;
  workMode: "office" | "remote";
  source: string;
  note: string;
  createdAt: string;
};

export type TimeProjectDto = {
  id: number;
  name: string;
  code: string;
  active: boolean;
  createdAt: string;
};

export type BreakEntryDto = {
  id: number;
  timeEntryId: number;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
};

export type WorkScheduleDto = {
  id: number;
  employeeId: number;
  workDays: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  timezone: string;
  updatedAt: string;
};

export type TimeCorrectionDto = {
  id: number;
  employeeId: number;
  timeEntryId: number | null;
  requestedClockIn: string;
  requestedClockOut: string;
  reason: string;
  status: string;
  reviewerEmail: string | null;
  reviewerNote: string;
  reviewedAt: string | null;
  createdAt: string;
};

export type PendingTimeCorrectionDto = Pick<
  TimeCorrectionDto,
  | "id"
  | "employeeId"
  | "requestedClockIn"
  | "requestedClockOut"
  | "reason"
  | "status"
  | "createdAt"
> & {
  employeeFirstName: string;
  employeeLastName: string;
};

export type TeamTimesheetRowDto = {
  employeeId: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  team: string | null;
  entryCount: number;
  workedMinutes: number;
  expectedMinutes: number;
  overtimeMinutes: number;
  longEntries: number;
  codeMinutes: Record<string, number>;
  openEntries: number;
  pendingCorrections: number;
  status: "open" | "locked" | "approved" | "revision_required";
  lockedAt: string | null;
  lockedByEmail: string | null;
};
