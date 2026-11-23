export type AccessPolicyDto = {
  id: number;
  role: string;
  label: string;
  managePeople: boolean;
  viewSensitiveData: boolean;
  approveLeave: boolean;
  approveTime: boolean;
  approveExpenses: boolean;
  viewAudit: boolean;
  manageSettings: boolean;
  manageInventory: boolean;
};

export type LeaveTypeDto = {
  id: number;
  code: string;
  name: string;
  color: string;
  defaultAllowance: number;
  requiresApproval: boolean;
};

export type CompanyHolidayDto = {
  id: number;
  date: string;
  name: string;
  createdAt: string;
};

export type CompanyEventDto = {
  id: number;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  location: string;
  url: string | null;
  active: boolean;
  createdByEmail: string;
  createdAt: string;
};

export type AnnouncementDto = {
  id: number;
  title: string;
  body: string;
  imageFileId: string | null;
  publishedAt: string;
  expiresAt: string | null;
  pinned: boolean;
  active: boolean;
  createdByEmail: string;
  createdAt: string;
  poll?: {
    id: number;
    title: string;
    description: string;
    questions: import("@/modules/announcements/polls").PollQuestion[];
  } | null;
  deliveries?: AnnouncementDeliveryDto[];
};

export type AnnouncementDeliveryDto = {
  id: number;
  channel: string;
  status: string;
  attempts: number;
  lastError: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type CompanyLinkDto = {
  id: number;
  label: string;
  url: string;
  description: string;
  sortOrder: number;
  active: boolean;
  createdByEmail: string;
  createdAt: string;
};

export type TimeProjectDto = {
  id: number;
  name: string;
  code: string;
  active: boolean;
  createdAt: string;
};

export type AdminPersonDto = {
  userId: number;
  email: string;
  role: string;
  employeeId: number | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  manageProjects: boolean;
};

export type LeaveBalanceDto = {
  id: number;
  employeeId: number;
  firstName: string;
  lastName: string;
  leaveTypeId: number;
  typeName: string;
  color: string;
  allowance: number;
  used: number;
  adjustment: number;
  year: number;
};

export type ExpensePolicyDto = {
  id: number;
  name: string;
  currency: string;
  perRequestLimit: number;
  annualLimit: number;
  maxRequestsPerYear: number;
  requiresReceipt: boolean;
  requiresApproval: boolean;
  enabled: boolean;
};

export type OrgUnitDto = {
  id: number;
  type: string;
  name: string;
  parentId: number | null;
  leadEmployeeId: number | null;
  active: boolean;
  sortOrder: number;
};

export type ReferenceValueDto = {
  id: number;
  kind: string;
  value: string;
  label: string;
  active: boolean;
  sortOrder: number;
};

export type ReportingPersonDto = {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
  division: string;
  department: string;
  team: string | null;
  managerId: number | null;
  divisionUnitId: number | null;
  departmentUnitId: number | null;
  teamUnitId: number | null;
};
