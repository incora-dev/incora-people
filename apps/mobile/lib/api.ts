import { API_ORIGIN, APP_VERSION } from "@/lib/config";
import type { MobileSession } from "@/lib/storage";

export type ApiUser = {
  email: string;
  role: "super_admin" | "hr_admin" | "manager" | "employee";
  employeeId: number | null;
  firstName: string;
  lastName: string;
  jobTitle: string;
  locale: "uk" | "en";
};

export type ApiMe = {
  user: ApiUser;
  access: Record<string, boolean | string | number>;
  capabilities: { apiVersion: "v1"; minimumClientVersion: string };
};

export type TimeStatus = {
  active: boolean;
  linked: boolean;
  entry: { id: number; clockIn: string; timeCode: string } | null;
  openBreak: { id: number; startedAt: string } | null;
};

export type WorkModeStatus = {
  mode: "office" | "remote";
  defaultMode: "office" | "remote";
  workDate: string;
};

export type MobileTimeOverview = {
  history: Array<{
    id: number;
    clockIn: string;
    clockOut: string | null;
    note: string;
    timeCode: string;
    projectId: number | null;
  }>;
  schedule: {
    startTime: string;
    endTime: string;
    breakMinutes: number;
  } | null;
  corrections: Array<{ id: number; status: string; reason: string }>;
  periodLocked: boolean;
  projects: Array<{ id: number; name: string; code: string }>;
};

export type Person = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  team: string | null;
  workMode: "office" | "remote";
  status: string;
};

export type LeaveOverview = {
  balances: Array<{
    id: number;
    leaveTypeId: number;
    code: string;
    name: string;
    color: string;
    allowance: number;
    used: number;
    adjustment: number;
  }>;
  requests: Array<{
    id: number;
    typeName: string;
    color: string;
    startDate: string;
    endDate: string;
    days: number;
    status: string;
    serialNumber: string;
    note: string;
    latestEvent: { eventType: string; createdAt: string } | null;
  }>;
  pending: Array<{
    id: number;
    employeeFirstName: string;
    employeeLastName: string;
    typeName: string;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
  }>;
};

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

export type MobileResources = {
  assets: Array<{
    id: number;
    name: string;
    assetTag: string;
    category: string;
    status: string;
    assigneeFirstName: string | null;
    assigneeLastName: string | null;
    serialNumber: string | null;
    note: string | null;
    latestEvent: { eventType: string; createdAt: string } | null;
  }>;
  companyDocuments: {
    folders: Array<{ id: number; name: string }>;
    documents: Array<{
      id: number;
      folderId: number | null;
      title: string;
      fileId: string;
      originalName: string;
      sizeBytes: number;
    }>;
  };
  employeeDocuments: Array<{
    id: string;
    category: string;
    originalName: string;
    sizeBytes: number;
    createdAt: string;
  }>;
};

export type KnowledgeArticle = {
  id: number;
  title: string;
  body: string;
  category: string;
  updatedAt: string;
  attachments?: Array<{
    id: string;
    originalName: string;
    sizeBytes: number;
    contentType: string;
  }>;
};

export type PersonProfile = {
  employee: Person & {
    division: string;
    managerName: string;
    startDate: string;
  };
  records: Array<{
    id: number;
    type: string;
    title: string;
    details: string;
    startDate: string | null;
    endDate: string | null;
  }>;
};

export type OrganizationData = {
  people: Array<{
    id: number;
    firstName: string;
    lastName: string;
    jobTitle: string;
    department: string;
    managerId: number | null;
    status: string;
  }>;
  units: Array<{
    id: number;
    name: string;
    kind: string;
    parentId: number | null;
    leadEmployeeId: number | null;
  }>;
};

export type MobileAdminData = {
  settings: {
    people: Array<{
      userId: number;
      email: string;
      role: ApiUser["role"];
      employeeId: number | null;
      firstName: string | null;
      lastName: string | null;
      jobTitle: string | null;
    }>;
    policies: Array<{
      id: number;
      label: string;
      role: string;
      managePeople: boolean;
      viewSensitiveData: boolean;
      approveLeave: boolean;
      approveTime: boolean;
      approveExpenses: boolean;
      viewAudit: boolean;
      manageSettings: boolean;
    }>;
    types: Array<{
      id: number;
      name: string;
      code: string;
      color: string;
      defaultAllowance: number;
      requiresApproval: boolean;
    }>;
    expensePolicies: Array<{
      id: number;
      name: string;
      currency: string;
      perRequestLimit: number;
      annualLimit: number;
      maxRequestsPerYear: number;
      requiresReceipt: boolean;
      requiresApproval: boolean;
      enabled: boolean;
    }>;
    units: Array<{
      id: number;
      name: string;
      type: string;
      parentId: number | null;
      leadEmployeeId: number | null;
      active: boolean;
    }>;
    balances: Array<{
      id: number;
      firstName: string;
      lastName: string;
      typeName: string;
      allowance: number;
      used: number;
      adjustment: number;
    }>;
  };
  reports: Array<{
    id: number;
    reporterEmail: string;
    description: string;
    status: string;
    createdAt: string;
  }>;
};

export type ExpenseOverview = {
  policy: {
    currency: string;
    annualLimit: number;
    perRequestLimit: number;
    maxRequestsPerYear: number;
    requiresReceipt: boolean;
    requiresApproval: boolean;
  } | null;
  approvedTotal: number;
  requestCount: number;
  requests: Array<{
    id: number;
    category: string;
    amountCents: number;
    currency: string;
    expenseDate: string;
    description: string;
    receiptUrl: string | null;
    status: string;
  }>;
  pending: Array<{
    id: number;
    employeeId: number;
    employeeFirstName: string;
    employeeLastName: string;
    category: string;
    amountCents: number;
    currency: string;
    expenseDate: string;
    description: string;
    receiptUrl: string | null;
    status: string;
  }>;
};

export type BugReport = {
  id: number;
  description: string;
  status: "open" | "resolved" | string;
  createdAt: string;
  screenshotFileId: string | null;
};

export type MobileUpload = {
  uri: string;
  name: string;
  type: string;
};

export type HomeData = {
  activePeople: number;
  departments: number;
  remote: number;
  onLeave: number;
  pendingApprovals: number;
  vacationAvailable: number;
  announcements: Array<{
    id: number;
    title: string;
    body: string;
    publishedAt: string;
    pinned: boolean;
  }>;
  personalTasks: Array<{
    id: number;
    title: string;
    description: string;
    dueDate: string | null;
    status: string;
  }>;
};

export type MobileAnnouncement = {
  id: number;
  title: string;
  body: string;
  publishedAt: string;
  expiresAt: string | null;
  pinned: boolean;
  createdByEmail: string;
};

export type MobileTask = {
  id: number;
  title: string;
  description: string;
  category: "general" | "onboarding" | "offboarding";
  assigneeEmployeeId: number;
  assigneeFirstName: string;
  assigneeLastName: string;
  dueDate: string | null;
  status: "todo" | "done";
  createdByEmail: string;
  completedAt: string | null;
  createdAt: string;
};

export type MobileTaskWorkspace = {
  tasks: MobileTask[];
  assignees: Array<{
    id: number;
    firstName: string;
    lastName: string;
    jobTitle: string;
  }>;
  canCreate: boolean;
};

export type MobileNotification = {
  id: number;
  title: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionExpiresAt: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  deviceId: string;
}): Promise<MobileSession> {
  const tokenSet = await postToken({
    grantType: "authorization_code",
    ...input,
  });
  return toSession(tokenSet);
}

export async function refreshSession(
  session: MobileSession,
  deviceId: string,
): Promise<MobileSession> {
  const tokenSet = await postToken({
    grantType: "refresh_token",
    refreshToken: session.refreshToken,
    deviceId,
  });
  return toSession(tokenSet);
}

export async function revokeSession(accessToken: string) {
  return apiRequest<{ revoked: true }>("/api/v1/auth/revoke", accessToken, {
    method: "POST",
  });
}

export async function getMe(accessToken: string) {
  const profile = await apiRequest<ApiMe>("/api/v1/me", accessToken);
  if (
    compareVersions(APP_VERSION, profile.capabilities.minimumClientVersion) < 0
  ) {
    throw new ApiError(
      "Ця версія застосунку більше не підтримується. Оновіть INCORA People.",
      426,
    );
  }
  return profile;
}

export async function getTimeStatus(accessToken: string) {
  return apiRequest<TimeStatus>("/api/v1/time/status", accessToken);
}

export async function getWorkMode(accessToken: string) {
  return apiRequest<WorkModeStatus>("/api/v1/work-mode", accessToken);
}

export async function updateWorkMode(
  accessToken: string,
  mode: WorkModeStatus["mode"],
  updateDefault = false,
) {
  return apiRequest<WorkModeStatus>("/api/v1/work-mode", accessToken, {
    method: "PATCH",
    body: JSON.stringify(updateDefault ? { defaultMode: mode } : { mode }),
  });
}

export async function updateLocale(accessToken: string, locale: "uk" | "en") {
  return apiRequest<{ locale: "uk" | "en" }>(
    "/api/v1/preferences",
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({ locale }),
    },
  );
}

export async function getAdminOverview(accessToken: string) {
  return apiRequest<MobileAdminData>("/api/v1/admin/overview", accessToken);
}

export async function updateUserRole(
  accessToken: string,
  id: number,
  role: ApiUser["role"],
) {
  return apiRequest<{ user: { id: number; role: string } }>(
    `/api/v1/admin/users/${id}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export async function updateAdminBug(
  accessToken: string,
  id: number,
  status: "open" | "resolved",
) {
  return apiRequest<{ report: { id: number; status: string } }>(
    `/api/v1/admin/bugs/${id}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export async function updateAccessPolicy(
  accessToken: string,
  policy: MobileAdminData["settings"]["policies"][number],
) {
  return apiRequest(`/api/v1/admin/access/${policy.id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(policy),
  });
}

export async function updateLeaveBalance(
  accessToken: string,
  id: number,
  allowance: number,
  adjustment: number,
) {
  return apiRequest(`/api/v1/admin/balances/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ allowance, adjustment }),
  });
}

export async function updateOrgUnitActive(
  accessToken: string,
  id: number,
  active: boolean,
) {
  return apiRequest(`/api/v1/admin/org-units/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export async function createOrgUnit(
  accessToken: string,
  input: {
    name: string;
    type: "division" | "department" | "team";
    parentId: number | null;
    leadEmployeeId: number | null;
  },
) {
  return apiRequest(`/api/v1/admin/org-units`, accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateOrgUnit(
  accessToken: string,
  id: number,
  input: {
    name: string;
    parentId: number | null;
    leadEmployeeId: number | null;
    active: boolean;
  },
) {
  return apiRequest(`/api/v1/admin/org-units/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type MobileTeamTime = {
  month: string;
  rows: Array<{
    employeeId: number;
    firstName: string;
    lastName: string;
    jobTitle: string;
    workedMinutes: number;
    expectedMinutes: number;
    overtimeMinutes: number;
    openEntries: number;
    pendingCorrections: number;
    status: string;
  }>;
  corrections: Array<{
    id: number;
    employeeFirstName: string;
    employeeLastName: string;
    requestedClockIn: string;
    requestedClockOut: string;
    reason: string;
    status: string;
  }>;
};

export async function getTeamTime(accessToken: string, month = "") {
  return apiRequest<MobileTeamTime>(
    `/api/v1/time/team${month ? `?month=${month}` : ""}`,
    accessToken,
  );
}

export async function reviewTimeCorrection(
  accessToken: string,
  id: number,
  decision: "approved" | "rejected",
  note = "",
) {
  return apiRequest(`/api/v1/time/corrections/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ decision, note }),
  });
}

export async function updateTimesheetPeriod(
  accessToken: string,
  employeeId: number,
  input: {
    month: string;
    status: "open" | "locked" | "approved" | "revision_required";
    note: string;
  },
) {
  return apiRequest(`/api/v1/time/periods/${employeeId}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateReimbursementPolicy(
  accessToken: string,
  policy: MobileAdminData["settings"]["expensePolicies"][number],
) {
  return apiRequest(`/api/v1/admin/reimbursements/${policy.id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(policy),
  });
}

export async function updateLeaveType(
  accessToken: string,
  policy: MobileAdminData["settings"]["types"][number],
) {
  return apiRequest(`/api/v1/admin/leave-types/${policy.id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(policy),
  });
}

export async function getTimeOverview(accessToken: string) {
  return apiRequest<MobileTimeOverview>("/api/v1/time/overview", accessToken);
}

export async function toggleBreak(
  accessToken: string,
  input: { action: "start" | "end"; breakId?: number } = { action: "start" },
) {
  return apiRequest<{ mode: "break_start" | "break_end" }>(
    "/api/v1/time/break",
    accessToken,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function createManualTime(
  accessToken: string,
  input: {
    clockIn: string;
    clockOut: string;
    note: string;
    projectId: number | null;
    timeCode: "project" | "internal" | "learning" | "admin";
  },
) {
  return apiRequest<{ entry: MobileTimeOverview["history"][number] }>(
    "/api/v1/time/manual",
    accessToken,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function requestTimeCorrection(
  accessToken: string,
  input: {
    timeEntryId: number;
    requestedClockIn: string;
    requestedClockOut: string;
    reason: string;
  },
) {
  return apiRequest("/api/v1/time/corrections", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPeople(accessToken: string, query = "") {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  const suffix = params.size ? `?${params.toString()}` : "";
  return apiRequest<{ people: Person[] }>(
    "/api/v1/people" + suffix,
    accessToken,
  );
}

export async function getPerson(accessToken: string, id: number) {
  return apiRequest<PersonProfile>(`/api/v1/people/${id}`, accessToken);
}

export async function getOrganization(accessToken: string) {
  return apiRequest<OrganizationData>("/api/v1/organization", accessToken);
}

export async function getLeaveOverview(accessToken: string) {
  return apiRequest<LeaveOverview>("/api/v1/leave", accessToken);
}

export async function createLeaveRequest(
  accessToken: string,
  input: {
    leaveTypeId: number;
    startDate: string;
    endDate: string;
    reason: string;
  },
) {
  return apiRequest<{ request: LeaveOverview["requests"][number] }>(
    "/api/v1/leave",
    accessToken,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function reviewLeaveRequest(
  accessToken: string,
  id: number,
  action: "approved" | "rejected" | "withdrawn",
  note = "",
) {
  return apiRequest<{ request: { id: number; status: string } }>(
    `/api/v1/leave/${id}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify({ action, note }) },
  );
}

export async function getLeaveCalendar(accessToken: string) {
  return apiRequest<{ events: LeaveCalendarEvent[] }>(
    "/api/v1/calendar",
    accessToken,
  );
}

export async function getResources(accessToken: string) {
  return apiRequest<MobileResources>("/api/v1/resources", accessToken);
}

export async function getKnowledge(accessToken: string) {
  return apiRequest<{ articles: KnowledgeArticle[] }>(
    "/api/v1/knowledge",
    accessToken,
  );
}

export async function getKnowledgeArticle(accessToken: string, id: number) {
  return apiRequest<{ article: KnowledgeArticle }>(
    `/api/v1/knowledge/${id}`,
    accessToken,
  );
}

export async function getExpenses(accessToken: string) {
  return apiRequest<ExpenseOverview>("/api/v1/expenses", accessToken);
}

export async function submitExpense(
  accessToken: string,
  input: {
    amount: string;
    category: "Sport" | "Health" | "Education" | "Other";
    expenseDate: string;
    description: string;
    receipt?: MobileUpload;
  },
) {
  const form = new FormData();
  form.append("amount", input.amount);
  form.append("category", input.category);
  form.append("expenseDate", input.expenseDate);
  form.append("description", input.description);
  if (input.receipt) form.append("receipt", toUpload(input.receipt));
  return apiFormRequest<{ request: { id: number; status: string } }>(
    "/api/v1/expenses/submit",
    accessToken,
    form,
  );
}

export async function reviewExpense(
  accessToken: string,
  id: number,
  action: "approved" | "rejected" | "withdrawn",
  note = "",
) {
  return apiRequest<{ request: { id: number; status: string } }>(
    `/api/v1/expenses/${id}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify({ action, note }) },
  );
}

export async function getBugReports(accessToken: string) {
  return apiRequest<{ reports: BugReport[] }>("/api/v1/bugs", accessToken);
}

export async function submitBugReport(
  accessToken: string,
  input: { description: string; screenshot: MobileUpload },
) {
  const form = new FormData();
  form.append("description", input.description);
  form.append("screenshot", toUpload(input.screenshot));
  return apiFormRequest<{ report: BugReport }>(
    "/api/v1/bugs",
    accessToken,
    form,
  );
}

export async function getHome(accessToken: string) {
  return apiRequest<HomeData>("/api/v1/home", accessToken);
}

export async function getAnnouncements(accessToken: string) {
  return apiRequest<{
    announcements: MobileAnnouncement[];
    canCreate: boolean;
  }>("/api/v1/announcements", accessToken);
}

export async function createAnnouncement(
  accessToken: string,
  input: {
    title: string;
    body: string;
    publishedAt: string;
    expiresAt: string;
    pinned: boolean;
  },
) {
  return apiRequest<{ announcement: MobileAnnouncement }>(
    "/api/v1/announcements",
    accessToken,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function getTasks(accessToken: string) {
  return apiRequest<MobileTaskWorkspace>("/api/v1/tasks", accessToken);
}

export async function createTask(
  accessToken: string,
  input: {
    title: string;
    description: string;
    category: MobileTask["category"];
    assigneeEmployeeId: number;
    dueDate: string;
  },
) {
  return apiRequest<{ task: MobileTask }>("/api/v1/tasks", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getNotifications(accessToken: string) {
  return apiRequest<{ notifications: MobileNotification[] }>(
    "/api/v1/notifications",
    accessToken,
  );
}

export async function markNotificationsRead(
  accessToken: string,
  input: { id?: number; all?: boolean },
) {
  return apiRequest<{ ok: true; readAt: string }>(
    "/api/v1/notifications",
    accessToken,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function registerPushToken(
  accessToken: string,
  input: { token: string; platform: "android" | "ios" },
) {
  return apiRequest<{ registered: true }>("/api/v1/push-tokens", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function unregisterPushToken(
  accessToken: string,
  input: { token: string; platform: "android" | "ios" },
) {
  return apiRequest<{ registered: false }>("/api/v1/push-tokens", accessToken, {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

export async function updateTask(
  accessToken: string,
  id: number,
  status: "todo" | "done",
) {
  return apiRequest<{ task: { id: number; status: string } }>(
    `/api/v1/tasks/${id}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export async function clockIn(
  accessToken: string,
  input: {
    projectId: number | null;
    timeCode: "project" | "internal" | "learning" | "admin";
  } = { projectId: null, timeCode: "internal" },
) {
  return apiRequest<{ mode: string; entry: TimeStatus["entry"] }>(
    "/api/v1/time/clock-in",
    accessToken,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function clockOut(accessToken: string) {
  return apiRequest<{ mode: string; entry: TimeStatus["entry"] | null }>(
    "/api/v1/time/clock-out",
    accessToken,
    { method: "POST", body: JSON.stringify({}) },
  );
}

async function postToken(body: Record<string, string>): Promise<TokenSet> {
  const response = await fetchWithTimeout(
    `${API_ORIGIN}/api/v1/auth/token`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    20_000,
  );
  if (!response.ok) throw await apiError(response);
  return response.json() as Promise<TokenSet>;
}

async function apiRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetchWithTimeout(
    `${API_ORIGIN}${path}`,
    {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    },
    20_000,
  );
  if (!response.ok) throw await apiError(response);
  return response.json() as Promise<T>;
}

async function apiFormRequest<T>(
  path: string,
  accessToken: string,
  form: FormData,
): Promise<T> {
  const response = await fetchWithTimeout(
    `${API_ORIGIN}${path}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body: form,
    },
    90_000,
  );
  if (!response.ok) throw await apiError(response);
  return response.json() as Promise<T>;
}

function toUpload(file: MobileUpload) {
  return {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob;
}

async function apiError(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return new ApiError(
    payload?.error ?? "Не вдалося виконати дію.",
    response.status,
  );
}

function toSession(tokenSet: TokenSet): MobileSession {
  return {
    accessToken: tokenSet.accessToken,
    refreshToken: tokenSet.refreshToken,
    accessExpiresAt: Date.now() + tokenSet.expiresIn * 1000,
    sessionExpiresAt: tokenSet.sessionExpiresAt,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new ApiError(
        "Сервер не відповідає. Перевірте з’єднання та спробуйте ще раз.",
        0,
      );
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

function compareVersions(left: string, right: string) {
  const normalize = (value: string) =>
    value
      .split(".")
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0);
  const leftParts = normalize(left);
  const rightParts = normalize(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
