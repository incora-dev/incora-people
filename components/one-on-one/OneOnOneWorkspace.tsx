"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClockAlert,
  Plus,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";
import { DateField } from "@/components/ui/DateField";
import { SearchableEmployeeSelect } from "@/components/ui/SearchableEmployeeSelect";
import { formatCount } from "@/lib/i18n";
import { calendarMonthDays, formatManualDate } from "@/modules/people/dates";
import { localDateKey } from "@/modules/shared/date";
import {
  countOneOnOnePlansByDay,
  filterAndSortOneOnOneDirectory,
  filterOneOnOnePlansByDay,
  filterOneOnOnePlansForCalendar,
  sortOneOnOneConversations,
  type OneOnOneDirectoryPlanFilter,
  type OneOnOneDirectorySort,
  type OneOnOneScheduleMode,
} from "@/modules/one-on-one/domain";

type Person = {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
  team?: string | null;
  managerId: number | null;
  probationEnd?: string | null;
};
type Note = {
  id: string;
  noteType: string;
  body: string;
  authorUserId: number;
  recipients: {
    userId: number;
    grantSource: string;
    sourceId: string | null;
  }[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};
type Meeting = {
  id: number;
  planId: number;
  employeeId: number;
  facilitatorEmail: string;
  creatorUserId: number | null;
  heldAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  riskStatus: string | null;
  reason: string;
  feedback: string;
  waysToSolve: string;
  canReadStructured: boolean;
  canManageMeeting: boolean;
  notes: Note[];
};
type Plan = {
  id: number;
  employeeId: number;
  facilitatorEmail: string;
  facilitatorKind: string;
  cadenceDays: number;
  active: boolean | number;
  nextDueDate: string | null;
  lastMeetingAt: string | null;
  dueAt: string;
  overdue: boolean;
  canEdit: boolean;
  employee: Person;
  manager: Person | null;
  meetings: Meeting[];
};
type DirectoryPerson = Person & {
  status: string;
  userId: number | null;
  canManage: boolean;
  manager: Person | null;
  meetingCount: number;
  lastConversationDate: string | null;
  nextDueDate: string | null;
};
type RecipientOption = {
  userId: number;
  employeeId: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
  teamUnitId: number | null;
};
type TeamOption = {
  id: number;
  name: string;
  memberCount: number;
  recipientUserIds: number[];
};
type Rule = {
  id: number;
  audience: string;
  cadenceDays: number;
  active: boolean;
};
type NoteType = "private_author" | "selected_recipients" | "employee_or_team";
type NoteDraft = {
  id: string;
  body: string;
  recipientUserIds: number[];
  includeEmployee: boolean;
  teamIds: number[];
  saved: boolean;
};

type Props = {
  plans: Plan[];
  people: Person[];
  directory: DirectoryPerson[];
  conversations: Meeting[];
  recipientOptions: RecipientOption[];
  teams: TeamOption[];
  rules: Rule[];
  canManageHr: boolean;
  currentEmail: string;
  currentName: string;
  today: string;
  readOnlyPreview?: boolean;
};

const noteTypes: NoteType[] = [
  "private_author",
  "selected_recipients",
  "employee_or_team",
];

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return formatManualDate(value.slice(0, 10)) || value;
}

function shiftMonth(monthKey: string, amount: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string, locale: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function personName(person?: { firstName?: string; lastName?: string } | null) {
  return `${person?.firstName ?? ""} ${person?.lastName ?? ""}`.trim();
}

function riskText(status: string | null, t: (key: string) => string) {
  if (status === "low_risk") return t("Low Risk");
  if (status === "medium_risk") return t("Medium Risk");
  if (status === "high_risk") return t("High Risk");
  if (status === "problem") return t("Problem");
  return t("Unassessed");
}

function noteTitle(type: NoteType, t: (key: string) => string) {
  if (type === "private_author") return t("For myself (manager)");
  if (type === "selected_recipients") return t("For selected person");
  return t("For employee or team");
}

function noteTypeForLegacy(note: Note) {
  return note.noteType === "legacy" ? null : (note.noteType as NoteType);
}

export function OneOnOneWorkspace({
  plans,
  people,
  directory,
  conversations,
  recipientOptions,
  teams,
  rules,
  canManageHr,
  currentEmail,
  currentName,
  today,
  readOnlyPreview = false,
}: Props) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [view, setView] = useState<OneOnOneScheduleMode>("planned");
  const [planOpen, setPlanOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState(today.slice(0, 7));
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeStatus, setEmployeeStatus] = useState("all");
  const [planFilter, setPlanFilter] =
    useState<OneOnOneDirectoryPlanFilter>("all");
  const [employeeSort, setEmployeeSort] =
    useState<OneOnOneDirectorySort>("name-asc");
  const [managerFilter, setManagerFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [planEmployeeId, setPlanEmployeeId] = useState<number | null>(null);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    null,
  );
  const [historyOrder, setHistoryOrder] = useState<"newest" | "oldest">(
    "newest",
  );
  const [meetingEmployeeId, setMeetingEmployeeId] = useState<number | null>(
    null,
  );
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [savedMeetingId, setSavedMeetingId] = useState<number | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [expandedNote, setExpandedNote] = useState<NoteType | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<
    Partial<Record<NoteType, NoteDraft>>
  >({});
  const [noteSaving, setNoteSaving] = useState<NoteType | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const syncStarted = useRef(false);
  const createRequestId = useRef("");
  const meetingFormRef = useRef<HTMLFormElement>(null);
  const scheduleSectionRef = useRef<HTMLElement>(null);
  const employeeListRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (
      !canManageHr ||
      readOnlyPreview ||
      plans.length > 0 ||
      !rules.some((rule) => rule.active) ||
      syncStarted.current
    )
      return;
    syncStarted.current = true;
    void fetch("/api/one-on-one", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    }).then((response) => {
      if (response.ok) router.refresh();
      else setError(t("Could not synchronize one-on-one plans."));
    });
  }, [canManageHr, plans.length, readOnlyPreview, router, rules, t]);

  const scheduledPlans = useMemo(
    () => filterOneOnOnePlansForCalendar(plans, view, today),
    [plans, today, view],
  );
  const dayCounts = useMemo(
    () => countOneOnOnePlansByDay(scheduledPlans),
    [scheduledPlans],
  );
  const visiblePlans = useMemo(
    () => filterOneOnOnePlansByDay(scheduledPlans, selectedDay),
    [scheduledPlans, selectedDay],
  );
  const calendarDays = useMemo(() => calendarMonthDays(monthKey), [monthKey]);

  const managerOptions = useMemo(() => {
    const byId = new Map<number, string>();
    for (const person of directory) {
      if (person.manager)
        byId.set(person.manager.id, personName(person.manager));
    }
    return [...byId.entries()].sort((left, right) =>
      left[1].localeCompare(right[1], "uk"),
    );
  }, [directory]);
  const teamOptions = useMemo(
    () =>
      [
        ...new Set(
          directory
            .map((person) => person.team)
            .filter((team): team is string => Boolean(team)),
        ),
      ].sort((a, b) => a.localeCompare(b, "uk")),
    [directory],
  );
  const activePlansByEmployee = useMemo(() => {
    const byEmployee = new Map<number, Plan[]>();
    for (const plan of plans.filter((entry) => entry.active)) {
      byEmployee.set(plan.employeeId, [
        ...(byEmployee.get(plan.employeeId) ?? []),
        plan,
      ]);
    }
    for (const plansForEmployee of byEmployee.values()) {
      plansForEmployee.sort(
        (left, right) =>
          left.dueAt.localeCompare(right.dueAt) || left.id - right.id,
      );
    }
    return byEmployee;
  }, [plans]);
  const employeesWithPlan = directory.filter(
    (person) => (activePlansByEmployee.get(person.id)?.length ?? 0) > 0,
  ).length;
  const filteredDirectory = useMemo(() => {
    const candidates = directory.filter((person) => {
      if (employeeStatus === "active" && person.status === "inactive")
        return false;
      if (employeeStatus === "terminated" && person.status !== "inactive")
        return false;
      if (managerFilter && String(person.managerId ?? "") !== managerFilter)
        return false;
      if (teamFilter && person.team !== teamFilter) return false;
      return true;
    });
    return filterAndSortOneOnOneDirectory(candidates, plans, {
      query: employeeSearch,
      planFilter,
      sort: employeeSort,
      selectedDay: view === "planned" ? selectedDay : null,
      locale: locale === "uk" ? "uk-UA" : "en-US",
    });
  }, [
    directory,
    employeeSearch,
    employeeStatus,
    employeeSort,
    locale,
    managerFilter,
    planFilter,
    plans,
    selectedDay,
    teamFilter,
    view,
  ]);
  const filteredEmployeesWithPlan = filteredDirectory.filter(
    (person) => (activePlansByEmployee.get(person.id)?.length ?? 0) > 0,
  ).length;
  const selectedEmployee =
    directory.find((person) => person.id === selectedEmployeeId) ?? null;
  const filteredRecipientOptions = useMemo(() => {
    const query = recipientSearch
      .trim()
      .toLocaleLowerCase(locale === "uk" ? "uk-UA" : "en-US");
    return recipientOptions.filter(
      (option) =>
        !query ||
        `${option.firstName} ${option.lastName} ${option.jobTitle}`
          .toLocaleLowerCase(locale === "uk" ? "uk-UA" : "en-US")
          .includes(query),
    );
  }, [locale, recipientOptions, recipientSearch]);
  const employeeHistory = useMemo(() => {
    if (!selectedEmployeeId) return [];
    return sortOneOnOneConversations(
      conversations.filter(
        (meeting) => meeting.employeeId === selectedEmployeeId,
      ),
      historyOrder,
    );
  }, [conversations, historyOrder, selectedEmployeeId]);
  const selectedActivePlan = meetingEmployeeId
    ? (plans.find(
        (plan) =>
          plan.employeeId === meetingEmployeeId &&
          plan.active &&
          plan.facilitatorEmail.trim().toLowerCase() ===
            currentEmail.trim().toLowerCase(),
      ) ?? null)
    : null;

  function scrollTo(ref: { current: HTMLElement | null }) {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() =>
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      ),
    );
  }

  function openEmployeeDirectory() {
    setView("planned");
    setSelectedDay(null);
    setSelectedEmployeeId(null);
    scrollTo(employeeListRef);
  }

  function openEmployeeHistory(employeeId: number) {
    setView("planned");
    setSelectedDay(null);
    setSelectedEmployeeId(employeeId);
    scrollTo(employeeListRef);
  }

  function openPlanDialog(employeeId: number | null = null) {
    setPlanEmployeeId(employeeId);
    setPlanOpen(true);
  }

  function resetMeetingDialog() {
    setMeetingEmployeeId(null);
    setEditingMeeting(null);
    setSavedMeetingId(null);
    setNoteDrafts({});
    setExpandedNote(null);
    setError("");
    createRequestId.current = "";
  }

  function openNewMeeting(employeeId: number) {
    setEditingMeeting(null);
    setSavedMeetingId(null);
    setMeetingEmployeeId(employeeId);
    setNoteDrafts({});
    setExpandedNote(null);
    createRequestId.current = crypto.randomUUID();
    setError("");
  }

  function openMeetingEditor(meeting: Meeting) {
    if (!meeting.canManageMeeting || readOnlyPreview) return;
    const drafts: Partial<Record<NoteType, NoteDraft>> = {};
    for (const note of meeting.notes) {
      const type = noteTypeForLegacy(note);
      if (!type) continue;
      drafts[type] = {
        id: note.id,
        body: note.body,
        recipientUserIds: note.recipients
          .filter((entry) => entry.grantSource === "person")
          .map((entry) => entry.userId),
        includeEmployee: note.recipients.some(
          (entry) => entry.grantSource === "employee",
        ),
        teamIds: [
          ...new Set(
            note.recipients
              .filter((entry) => entry.grantSource === "team")
              .map((entry) => Number(entry.sourceId))
              .filter(Number.isFinite),
          ),
        ],
        saved: true,
      };
    }
    setEditingMeeting(meeting);
    setSavedMeetingId(meeting.id);
    setMeetingEmployeeId(meeting.employeeId);
    setNoteDrafts(drafts);
    setExpandedNote(null);
    setError("");
  }

  function ensureDraft(type: NoteType) {
    setNoteDrafts((current) => ({
      ...current,
      [type]: current[type] ?? {
        id: crypto.randomUUID(),
        body: "",
        recipientUserIds: [],
        includeEmployee: false,
        teamIds: [],
        saved: false,
      },
    }));
    setExpandedNote((current) => (current === type ? null : type));
  }

  function setDraft(type: NoteType, patch: Partial<NoteDraft>) {
    setNoteDrafts((current) => ({
      ...current,
      [type]: {
        id: current[type]?.id ?? crypto.randomUUID(),
        body: current[type]?.body ?? "",
        recipientUserIds: current[type]?.recipientUserIds ?? [],
        includeEmployee: current[type]?.includeEmployee ?? false,
        teamIds: current[type]?.teamIds ?? [],
        saved: current[type]?.saved ?? false,
        ...patch,
      },
    }));
  }

  function meetingValues(form: HTMLFormElement) {
    const values = new FormData(form);
    return {
      heldAt: String(values.get("heldAt") ?? ""),
      riskStatus: String(values.get("riskStatus") ?? "") || null,
      reason: String(values.get("reason") ?? "").trim(),
      feedback: String(values.get("feedback") ?? "").trim(),
      waysToSolve: String(values.get("waysToSolve") ?? "").trim(),
      cadenceDays: Number(values.get("cadenceDays") ?? 30),
    };
  }

  async function ensureMeetingSaved() {
    if (savedMeetingId) return savedMeetingId;
    const form = meetingFormRef.current;
    if (!form || !form.reportValidity()) return null;
    const values = meetingValues(form);
    const response = await fetch("/api/one-on-one", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "meeting",
        requestId: createRequestId.current || crypto.randomUUID(),
        employeeId: meetingEmployeeId,
        ...(selectedActivePlan ? { planId: selectedActivePlan.id } : {}),
        ...values,
        notes: "",
        sharedWithEmployee: false,
        sharedWithManager: false,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      meeting?: { id: number };
      error?: string;
    };
    if (!response.ok || !result.meeting?.id) {
      setError(result.error ?? t("Could not save the conversation."));
      return null;
    }
    setSavedMeetingId(result.meeting.id);
    setMessage(t("Conversation saved. Notes can now be saved separately."));
    router.refresh();
    return result.meeting.id;
  }

  async function saveNote(type: NoteType) {
    if (readOnlyPreview || noteSaving) return;
    const draft = noteDrafts[type];
    if (!draft?.body.trim()) {
      setError(t("Enter note text before saving."));
      return;
    }
    setError("");
    setNoteSaving(type);
    try {
      const meetingId = await ensureMeetingSaved();
      if (!meetingId) return;
      const response = await fetch("/api/one-on-one", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "note.save",
          noteId: draft.id,
          meetingId,
          noteType: type,
          body: draft.body,
          recipientUserIds: draft.recipientUserIds,
          includeEmployee: draft.includeEmployee,
          teamIds: draft.teamIds,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        noteId?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? t("Could not save note."));
      setDraft(type, { id: result.noteId ?? draft.id, saved: true });
      setMessage(t("Note and sharing access saved."));
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("Could not save note."),
      );
    } finally {
      setNoteSaving(null);
    }
  }

  async function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnlyPreview || busy) return;
    setBusy(true);
    setError("");
    try {
      const values = meetingValues(event.currentTarget);
      if (editingMeeting) {
        const response = await fetch("/api/one-on-one", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "meeting.update",
            meetingId: editingMeeting.id,
            ...values,
          }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error ?? t("Could not update conversation."));
        setMessage(t("Conversation details updated."));
      } else if (!savedMeetingId) {
        const created = await ensureMeetingSaved();
        if (!created) return;
      } else {
        const response = await fetch("/api/one-on-one", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "meeting.update",
            meetingId: savedMeetingId,
            ...values,
          }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error ?? t("Could not update conversation."));
        setMessage(t("Conversation details updated."));
      }
      resetMeetingDialog();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("Could not save the conversation."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteMeeting(meeting: Meeting) {
    if (readOnlyPreview || !meeting.canManageMeeting) return;
    if (
      !window.confirm(
        t(
          "Remove this conversation from ordinary history? The audit record will be retained.",
        ),
      )
    )
      return;
    const response = await fetch("/api/one-on-one", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "meeting.delete", meetingId: meeting.id }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok)
      setError(result.error ?? t("Could not remove conversation."));
    else {
      setMessage(t("Conversation removed from ordinary history."));
      router.refresh();
    }
  }

  async function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnlyPreview) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/one-on-one", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "plan",
          employeeId: form.get("employeeId"),
          cadenceDays: form.get("cadenceDays"),
          active: true,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? t("Could not save one-on-one plan."));
      setPlanOpen(false);
      setPlanEmployeeId(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("Could not save one-on-one plan."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitPlanCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPlan || readOnlyPreview) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/one-on-one", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "plan.update",
          planId: editingPlan.id,
          nextDueDate: form.get("nextDueDate"),
          cadenceDays: form.get("cadenceDays"),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? t("Could not update schedule."));
      setEditingPlan(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("Could not update schedule."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnlyPreview) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/one-on-one", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "rule",
        audience: form.get("audience"),
        cadenceDays: form.get("cadenceDays"),
        active: true,
      }),
    });
    if (response.ok) router.refresh();
    else {
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(result.error ?? t("Could not save rule."));
    }
  }

  const activeMeetingEmployee =
    directory.find((person) => person.id === meetingEmployeeId) ?? null;
  const meetingDialogOpen = meetingEmployeeId !== null;

  return (
    <>
      <section className="page-heading-row">
        <div>
          <p className="eyebrow">{t("People development")}</p>
          <h1>{t("One-on-one meetings")}</h1>
          <p>
            {t(
              "Due-by dates, recorded conversations and private/shared feedback.",
            )}
          </p>
        </div>
        {!readOnlyPreview && people.length > 0 && (
          <button
            className="button primary-button"
            onClick={() => openPlanDialog()}
          >
            <Plus size={16} /> {t("Set up one-on-one")}
          </button>
        )}
      </section>

      <section className="one-on-one-summary">
        <button
          className={`panel one-on-one-summary-card ${view === "planned" ? "selected" : ""}`}
          onClick={openEmployeeDirectory}
        >
          <Users />
          <strong>{directory.length}</strong>
          <span>{t("Employees")}</span>
          <small>
            {employeesWithPlan} {t("with a schedule")}
          </small>
        </button>
        <button
          className={`panel one-on-one-summary-card warning ${view === "overdue" ? "selected" : ""}`}
          onClick={() => {
            setView("overdue");
            setSelectedDay(null);
            scrollTo(scheduleSectionRef);
          }}
        >
          <ClockAlert />
          <strong>
            {plans.filter((plan) => plan.active && plan.dueAt < today).length}
          </strong>
          <span>{t("Overdue meetings")}</span>
        </button>
      </section>

      {canManageHr && !readOnlyPreview && (
        <section className="panel one-on-one-rules">
          <header className="one-on-one-rules-heading">
            <div>
              <h2>{t("HR cadence rules")}</h2>
              {!rulesExpanded && (
                <p>
                  {(["developers", "managers", "probation"] as const)
                    .map((audience) => {
                      const rule = rules.find(
                        (entry) => entry.audience === audience,
                      );
                      const days =
                        rule?.cadenceDays ??
                        (audience === "probation" ? 14 : 30);
                      return `${t(audience)}: ${days} ${t("days")}`;
                    })
                    .join(" · ")}
                </p>
              )}
            </div>
            <button
              className="button ghost-button"
              type="button"
              aria-expanded={rulesExpanded}
              aria-controls="one-on-one-cadence-rule-rows"
              onClick={() => setRulesExpanded((expanded) => !expanded)}
            >
              {rulesExpanded ? t("Collapse") : t("Edit")}
            </button>
          </header>
          {rulesExpanded && (
            <div
              id="one-on-one-cadence-rule-rows"
              className="one-on-one-rule-rows"
            >
              {["developers", "managers", "probation"].map((audience) => {
                const rule = rules.find((entry) => entry.audience === audience);
                return (
                  <form key={audience} onSubmit={submitRule}>
                    <input type="hidden" name="audience" value={audience} />
                    <strong>{t(audience)}</strong>
                    <label>
                      {t("Every")}{" "}
                      <input
                        name="cadenceDays"
                        type="number"
                        min="7"
                        max="365"
                        defaultValue={
                          rule?.cadenceDays ??
                          (audience === "probation" ? 14 : 30)
                        }
                      />{" "}
                      {t("days")}
                    </label>
                    <button className="button ghost-button">{t("Save")}</button>
                  </form>
                );
              })}
            </div>
          )}
        </section>
      )}

      {message && (
        <p className="settings-toast">
          <CheckCircle2 size={14} /> {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}

      <section
        ref={scheduleSectionRef}
        className="panel one-on-one-schedule-workspace"
      >
        <div
          className="one-on-one-mode-buttons"
          role="group"
          aria-label={t("Conversation calendar mode")}
        >
          <button
            className={`button ${view === "planned" ? "primary-button" : "secondary-button"}`}
            onClick={() => {
              setView("planned");
              setSelectedDay(null);
            }}
          >
            {t("Scheduled")}
          </button>
          <button
            className={`button ${view === "overdue" ? "primary-button" : "secondary-button"}`}
            onClick={() => {
              setView("overdue");
              setSelectedDay(null);
            }}
          >
            {t("Overdue mode")}
          </button>
        </div>
        <div className="one-on-one-calendar-heading">
          <h2>
            {view === "planned"
              ? t("Planned conversations")
              : t("Overdue conversations")}
          </h2>
          <p>
            {t(
              "The date shown is the next required conversation due date; it is not a booked appointment time.",
            )}
          </p>
        </div>
        <div
          className="one-on-one-calendar"
          aria-label={monthLabel(monthKey, locale)}
        >
          <header>
            <button
              className="icon-button"
              aria-label={t("Previous month")}
              onClick={() => setMonthKey((value) => shiftMonth(value, -1))}
            >
              <ChevronLeft size={17} />
            </button>
            <strong>{monthLabel(monthKey, locale)}</strong>
            <button
              className="icon-button"
              aria-label={t("Next month")}
              onClick={() => setMonthKey((value) => shiftMonth(value, 1))}
            >
              <ChevronRight size={17} />
            </button>
          </header>
          <div className="one-on-one-calendar-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <span className="one-on-one-weekday" key={day}>
                {t(day)}
              </span>
            ))}
            {calendarDays.map((day) => {
              const count = dayCounts.get(day) ?? 0;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    setSelectedDay((current) => (current === day ? null : day))
                  }
                  className={`one-on-one-calendar-day ${day.slice(0, 7) !== monthKey ? "outside-month" : ""} ${day === today ? "today" : ""} ${selectedDay === day ? "selected" : ""} ${count ? "has-events" : ""}`}
                  aria-pressed={selectedDay === day}
                  aria-label={`${dateLabel(day)}${count ? ` · ${formatCount(locale, count, { one: "зустріч", few: "зустрічі", many: "зустрічей" }, { one: "conversation", many: "conversations" })}` : ""}`}
                >
                  <span>{Number(day.slice(8))}</span>
                  {count > 0 && <small>{count}</small>}
                </button>
              );
            })}
          </div>
        </div>
        {view === "overdue" && (
          <>
            <div className="one-on-one-calendar-list-heading">
              <div>
                <h3>
                  {selectedDay
                    ? `${t("Conversations for")} ${dateLabel(selectedDay)}`
                    : t("Overdue conversations")}
                </h3>
                <span>
                  {visiblePlans.length} {t("conversations")}
                </span>
              </div>
              {selectedDay && (
                <button
                  className="button ghost-button"
                  onClick={() => setSelectedDay(null)}
                >
                  {t("Clear day filter")}
                </button>
              )}
            </div>
            <div className="one-on-one-overdue-grid">
              {visiblePlans.map((plan) => (
                <article
                  className={`panel one-on-one-card ${view === "overdue" ? "overdue" : ""}`}
                  key={plan.id}
                >
                  <header>
                    <div>
                      <h3>{personName(plan.employee)}</h3>
                      <p>
                        {plan.employee.jobTitle}
                        {plan.employee.team ? ` · ${plan.employee.team}` : ""}
                      </p>
                    </div>
                    <span className={`one-on-one-schedule-status ${view}`}>
                      {view === "overdue" ? t("Overdue") : t("Scheduled")}
                    </span>
                  </header>
                  <dl>
                    <div>
                      <dt>{t("Next conversation due by")}</dt>
                      <dd>{dateLabel(plan.dueAt)}</dd>
                    </div>
                    <div>
                      <dt>{t("Responsible manager")}</dt>
                      <dd>
                        {personName(plan.manager) ||
                          (plan.facilitatorKind === "hr"
                            ? t("HR")
                            : t("Not specified"))}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("Previous conversation")}</dt>
                      <dd>{dateLabel(plan.lastMeetingAt)}</dd>
                    </div>
                    <div>
                      <dt>{t("Recurrence")}</dt>
                      <dd>
                        {formatCount(
                          locale,
                          plan.cadenceDays,
                          { one: "день", few: "дні", many: "днів" },
                          { one: "day", many: "days" },
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="one-on-one-card-actions">
                    <button
                      className="button ghost-button"
                      onClick={() => openEmployeeHistory(plan.employeeId)}
                    >
                      {t("Open employee history")}
                    </button>
                    {plan.canEdit && (
                      <button
                        className="button secondary-button"
                        onClick={() => setEditingPlan(plan)}
                      >
                        {t("Correct schedule")}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!visiblePlans.length && (
                <div className="panel compact-empty">
                  {selectedDay
                    ? t("No conversations on this day.")
                    : t("No overdue conversations.")}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {view === "planned" && (
        <section
          ref={employeeListRef}
          tabIndex={-1}
          className="panel one-on-one-employees-panel"
        >
          <header className="one-on-one-employees-heading">
            <div>
              <p className="eyebrow">{t("One-on-one")}</p>
              <h2>
                {selectedEmployee
                  ? personName(selectedEmployee)
                  : t("Employees")}
              </h2>
              <p>
                {selectedEmployee
                  ? t(
                      "Recorded conversation history, newest added first by default.",
                    )
                  : selectedDay
                    ? `${t("Showing plans due on")} ${dateLabel(selectedDay)}`
                    : t(
                        "Accessible employees, including people with no recorded conversations.",
                      )}
              </p>
            </div>
            {selectedEmployee && (
              <button
                className="button ghost-button"
                onClick={() => setSelectedEmployeeId(null)}
              >
                {t("Back to employees")}
              </button>
            )}
          </header>
          {!selectedEmployee ? (
            <>
              <div className="one-on-one-employee-filters">
                <input
                  type="search"
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                  placeholder={t("Search employees")}
                  aria-label={t("Search employees")}
                />
                <select
                  value={employeeStatus}
                  onChange={(event) => setEmployeeStatus(event.target.value)}
                  aria-label={t("Employment status")}
                >
                  <option value="all">{t("All")}</option>
                  <option value="active">{t("Active")}</option>
                  <option value="terminated">{t("Terminated")}</option>
                </select>
                <select
                  value={planFilter}
                  onChange={(event) =>
                    setPlanFilter(
                      event.target.value as OneOnOneDirectoryPlanFilter,
                    )
                  }
                  aria-label={t("Filter by one-on-one schedule")}
                >
                  <option value="all">{t("All schedule states")}</option>
                  <option value="has-plan">{t("Has plan")}</option>
                  <option value="no-plan">{t("Without plan")}</option>
                </select>
                <select
                  value={employeeSort}
                  onChange={(event) =>
                    setEmployeeSort(event.target.value as OneOnOneDirectorySort)
                  }
                  aria-label={t("Sort one-on-one employees")}
                >
                  <option value="name-asc">{t("Name: A–Z")}</option>
                  <option value="name-desc">{t("Name: Z–A")}</option>
                  <option value="date-asc">{t("Nearest one-on-one")}</option>
                  <option value="date-desc">{t("Farthest one-on-one")}</option>
                </select>
                <select
                  value={managerFilter}
                  onChange={(event) => setManagerFilter(event.target.value)}
                  aria-label={t("Manager filter")}
                >
                  <option value="">{t("All managers")}</option>
                  {managerOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={teamFilter}
                  onChange={(event) => setTeamFilter(event.target.value)}
                  aria-label={t("Team filter")}
                >
                  <option value="">{t("All teams")}</option>
                  {teamOptions.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
                <span>
                  {formatCount(
                    locale,
                    filteredDirectory.length,
                    {
                      one: "працівник",
                      few: "працівники",
                      many: "працівників",
                    },
                    { one: "employee", many: "employees" },
                  )}{" "}
                  · {filteredEmployeesWithPlan} {t("with a schedule")}
                </span>
                {selectedDay && (
                  <button
                    className="button ghost-button"
                    onClick={() => setSelectedDay(null)}
                  >
                    {t("Clear day filter")}
                  </button>
                )}
              </div>
              <div
                className="one-on-one-directory-table"
                role="table"
                aria-label={t("Employee one-on-one schedules")}
              >
                <div className="one-on-one-directory-head" role="row">
                  {[
                    "Employee",
                    "Responsible manager",
                    "Plan status",
                    "Next planned date",
                    "Status",
                    "Actions",
                  ].map((label) => (
                    <span role="columnheader" key={label}>
                      {t(label)}
                    </span>
                  ))}
                </div>
                {filteredDirectory.map((person) => {
                  const personPlans =
                    activePlansByEmployee.get(person.id) ?? [];
                  const matchingPlans = selectedDay
                    ? personPlans.filter((plan) => plan.dueAt === selectedDay)
                    : personPlans;
                  const primaryPlan =
                    matchingPlans[0] ?? personPlans[0] ?? null;
                  const nextDueDate = selectedDay
                    ? (matchingPlans[0]?.dueAt ?? null)
                    : person.nextDueDate;
                  const planStatus = !personPlans.length
                    ? "no-plan"
                    : primaryPlan && primaryPlan.dueAt < today
                      ? "overdue"
                      : "planned";

                  return (
                    <div
                      className="one-on-one-directory-row"
                      role="row"
                      key={person.id}
                    >
                      <span role="cell">
                        <small className="one-on-one-mobile-label">
                          {t("Employee")}
                        </small>
                        <strong>{personName(person)}</strong>
                        <small>
                          {person.jobTitle}
                          {person.team ? ` · ${person.team}` : ""}
                        </small>
                      </span>
                      <span role="cell">
                        <small className="one-on-one-mobile-label">
                          {t("Responsible manager")}
                        </small>
                        <strong>
                          {personName(primaryPlan?.manager ?? person.manager) ||
                            "—"}
                        </strong>
                      </span>
                      <span role="cell">
                        <small className="one-on-one-mobile-label">
                          {t("Plan status")}
                        </small>
                        <strong>
                          {primaryPlan
                            ? `${t("Has plan")} · ${formatCount(locale, primaryPlan.cadenceDays, { one: "день", few: "дні", many: "днів" }, { one: "day", many: "days" })}`
                            : t("Without plan")}
                        </strong>
                      </span>
                      <span role="cell">
                        <small className="one-on-one-mobile-label">
                          {t("Next planned date")}
                        </small>
                        <strong>{dateLabel(nextDueDate)}</strong>
                      </span>
                      <span role="cell">
                        <small className="one-on-one-mobile-label">
                          {t("Status")}
                        </small>
                        <strong>
                          {person.status === "inactive"
                            ? t("Terminated")
                            : planStatus === "overdue"
                              ? t("Overdue")
                              : planStatus === "planned"
                                ? t("Scheduled status")
                                : t("Without plan")}
                        </strong>
                      </span>
                      <span
                        className="one-on-one-directory-actions"
                        role="cell"
                      >
                        <button
                          className="button ghost-button"
                          onClick={() => openEmployeeHistory(person.id)}
                        >
                          {t("History")}
                        </button>
                        {personPlans.map(
                          (plan) =>
                            plan.canEdit && (
                              <button
                                key={plan.id}
                                className="button secondary-button"
                                onClick={() => setEditingPlan(plan)}
                              >
                                {t("Correct schedule")} · {plan.cadenceDays}
                              </button>
                            ),
                        )}
                        {!personPlans.length &&
                          person.canManage &&
                          person.status !== "inactive" &&
                          !readOnlyPreview && (
                            <button
                              className="button secondary-button"
                              onClick={() => openPlanDialog(person.id)}
                            >
                              {t("Set up schedule")}
                            </button>
                          )}
                      </span>
                    </div>
                  );
                })}
                {!filteredDirectory.length && (
                  <p className="compact-empty" role="status">
                    {t("No employees match these filters.")}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="one-on-one-history-toolbar">
                <span>
                  {selectedEmployee.jobTitle}
                  {selectedEmployee.team
                    ? ` · ${selectedEmployee.team}`
                    : ""} · {selectedEmployee.meetingCount} {t("conversations")}
                </span>
                <div>
                  <label>{t("Sort added")}</label>
                  <select
                    value={historyOrder}
                    onChange={(event) =>
                      setHistoryOrder(event.target.value as "newest" | "oldest")
                    }
                  >
                    <option value="newest">{t("Newest first")}</option>
                    <option value="oldest">{t("Oldest first")}</option>
                  </select>
                  {selectedEmployee.canManage && !readOnlyPreview && (
                    <button
                      className="button primary-button"
                      onClick={() => openNewMeeting(selectedEmployee.id)}
                    >
                      <Plus size={15} /> {t("Record conversation")}
                    </button>
                  )}
                </div>
              </div>
              <div className="one-on-one-conversation-history">
                {employeeHistory.map((meeting) => (
                  <article
                    className="panel one-on-one-conversation-card"
                    key={meeting.id}
                  >
                    <header>
                      <div>
                        <h3>
                          {t("Conversation")} · {dateLabel(meeting.heldAt)}
                        </h3>
                        <p>
                          {t("Added")}:{" "}
                          {new Date(meeting.createdAt).toLocaleString(
                            locale === "uk" ? "uk-UA" : "en-US",
                          )}
                        </p>
                      </div>
                      {meeting.canReadStructured && (
                        <span
                          className={`risk-status risk-${meeting.riskStatus ?? "unassessed"}`}
                        >
                          {riskText(meeting.riskStatus, t)}
                        </span>
                      )}
                    </header>
                    {meeting.canReadStructured ? (
                      <dl className="one-on-one-feedback-fields">
                        <div>
                          <dt>{t("Feedback date")}</dt>
                          <dd>{dateLabel(meeting.heldAt)}</dd>
                        </div>
                        <div>
                          <dt>{t("Manager")}</dt>
                          <dd>
                            {personName(
                              directory.find(
                                (person) =>
                                  person.userId === meeting.creatorUserId,
                              ),
                            ) || meeting.facilitatorEmail}
                          </dd>
                        </div>
                        <div>
                          <dt>{t("Risk status")}</dt>
                          <dd>{riskText(meeting.riskStatus, t)}</dd>
                        </div>
                        <div>
                          <dt>{t("Reason")}</dt>
                          <dd>{meeting.reason || "—"}</dd>
                        </div>
                        <div>
                          <dt>{t("Feedback")}</dt>
                          <dd>{meeting.feedback || "—"}</dd>
                        </div>
                        <div>
                          <dt>{t("Ways to solve")}</dt>
                          <dd>{meeting.waysToSolve || "—"}</dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="one-on-one-private-summary">
                        {t(
                          "Private conversation details are not available to this account.",
                        )}
                      </p>
                    )}
                    {meeting.notes.map((note) => (
                      <section className="one-on-one-note-view" key={note.id}>
                        <strong>
                          {note.noteType === "legacy"
                            ? t("Legacy note (original sharing preserved)")
                            : noteTitle(note.noteType as NoteType, t)}
                        </strong>
                        <p>{note.body}</p>
                        {note.canEdit && (
                          <small>
                            {t("Shared recipients")}:{" "}
                            {note.recipients.length
                              ? note.recipients
                                  .map((recipient) =>
                                    recipientName(
                                      recipient.userId,
                                      recipientOptions,
                                    ),
                                  )
                                  .filter(Boolean)
                                  .join(", ")
                              : t("No recipients")}
                          </small>
                        )}
                      </section>
                    ))}
                    {meeting.canManageMeeting && !readOnlyPreview && (
                      <div className="one-on-one-card-actions">
                        <button
                          className="button secondary-button"
                          onClick={() => openMeetingEditor(meeting)}
                        >
                          {t("Edit conversation")}
                        </button>
                        <button
                          className="button danger-button"
                          onClick={() => void deleteMeeting(meeting)}
                        >
                          {t("Remove from history")}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
                {!employeeHistory.length && (
                  <div className="panel compact-empty">
                    {t(
                      "No conversations have been recorded for this employee yet.",
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {planOpen && !readOnlyPreview && (
        <DialogBackdrop
          onClose={() => {
            setPlanOpen(false);
            setPlanEmployeeId(null);
          }}
        >
          <form
            className="dialog compact-dialog form-grid"
            onSubmit={submitPlan}
          >
            <h2>{t("Set up one-on-one")}</h2>
            <label className="span-two">
              {t("Employee")}
              <SearchableEmployeeSelect
                name="employeeId"
                options={people}
                defaultValue={planEmployeeId}
                required
                placeholder={t("Select employee")}
                searchPlaceholder={t("Search by name or position")}
                emptyLabel={t("No employees found.")}
              />
            </label>
            <label>
              {t("Cadence in days")}
              <input
                name="cadenceDays"
                type="number"
                min="7"
                max="365"
                defaultValue="30"
                required
              />
            </label>
            <div className="dialog-actions span-two">
              <button
                type="button"
                className="button ghost-button"
                onClick={() => {
                  setPlanOpen(false);
                  setPlanEmployeeId(null);
                }}
              >
                {t("Cancel")}
              </button>
              <button className="button primary-button" disabled={busy}>
                {busy ? t("Saving…") : t("Save")}
              </button>
            </div>
          </form>
        </DialogBackdrop>
      )}

      {editingPlan && !readOnlyPreview && (
        <DialogBackdrop onClose={() => setEditingPlan(null)}>
          <form
            className="dialog compact-dialog form-grid"
            onSubmit={submitPlanCorrection}
          >
            <h2>{t("Correct conversation schedule")}</h2>
            <p className="span-two">
              {personName(editingPlan.employee)} ·{" "}
              {t("This is a due-by date, not a confirmed appointment time.")}
            </p>
            <DateField
              name="nextDueDate"
              label={t("Next conversation due by")}
              value={editingPlan.dueAt}
              required
            />
            <label>
              {t("Recurrence in days")}
              <input
                name="cadenceDays"
                type="number"
                min="7"
                max="365"
                defaultValue={editingPlan.cadenceDays}
                required
              />
            </label>
            <div className="dialog-actions span-two">
              <button
                type="button"
                className="button ghost-button"
                onClick={() => setEditingPlan(null)}
              >
                {t("Cancel")}
              </button>
              <button className="button primary-button" disabled={busy}>
                {t("Save schedule")}
              </button>
            </div>
          </form>
        </DialogBackdrop>
      )}

      {meetingDialogOpen && !readOnlyPreview && activeMeetingEmployee && (
        <DialogBackdrop onClose={resetMeetingDialog}>
          <form
            ref={meetingFormRef}
            className="dialog one-on-one-meeting-dialog form-grid"
            onSubmit={submitMeeting}
          >
            <h2 className="span-two">
              {editingMeeting
                ? t("Edit conversation")
                : t("Record conversation")}
            </h2>
            <label className="span-two">
              {t("Employee")}
              <input
                value={`${personName(activeMeetingEmployee)} · ${activeMeetingEmployee.jobTitle}`}
                readOnly
              />
            </label>
            <DateField
              name="heldAt"
              label={t("Feedback date")}
              value={editingMeeting?.heldAt.slice(0, 10) ?? localDateKey()}
              required
            />
            <label>
              {t("Manager / author")}
              <input value={currentName} readOnly />
            </label>
            <label>
              {t("Risk status")}
              <select
                name="riskStatus"
                defaultValue={editingMeeting?.riskStatus ?? ""}
              >
                <option value="">{t("Unassessed")}</option>
                <option value="low_risk">{t("Low Risk")}</option>
                <option value="medium_risk">{t("Medium Risk")}</option>
                <option value="high_risk">{t("High Risk")}</option>
                <option value="problem">{t("Problem")}</option>
              </select>
            </label>
            <label>
              {t("Recurrence in days")}
              <input
                name="cadenceDays"
                type="number"
                min="7"
                max="365"
                defaultValue={
                  editingMeeting
                    ? (plans.find((plan) => plan.id === editingMeeting.planId)
                        ?.cadenceDays ?? 30)
                    : (selectedActivePlan?.cadenceDays ?? 30)
                }
                disabled={Boolean(editingMeeting)}
                required
              />
            </label>
            <label className="span-two">
              {t("Reason")}
              <textarea
                name="reason"
                rows={2}
                maxLength={4000}
                defaultValue={editingMeeting?.reason ?? ""}
              />
            </label>
            <label className="span-two">
              {t("Feedback")}
              <textarea
                name="feedback"
                rows={3}
                maxLength={8000}
                defaultValue={editingMeeting?.feedback ?? ""}
              />
            </label>
            <label className="span-two">
              {t("Ways to solve")}
              <textarea
                name="waysToSolve"
                rows={3}
                maxLength={8000}
                defaultValue={editingMeeting?.waysToSolve ?? ""}
              />
            </label>
            <div className="one-on-one-note-editors span-two">
              <h3>{t("Conversation notes")}</h3>
              <p>
                {t(
                  "Each note has an independent audience. Saving a note does not share the other sections.",
                )}
              </p>
              {noteTypes.map((type, index) => {
                const draft = noteDrafts[type];
                const expanded = expandedNote === type;
                return (
                  <section className="one-on-one-note-editor" key={type}>
                    <button
                      className="one-on-one-note-toggle"
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => ensureDraft(type)}
                    >
                      <span>
                        {index + 1}. {noteTitle(type, t)}
                      </span>
                      <span>
                        {draft?.saved
                          ? t("Saved")
                          : expanded
                            ? t("Close")
                            : t("Add note")}
                      </span>
                    </button>
                    {expanded && (
                      <div className="one-on-one-note-editor-body">
                        <p>
                          {type === "private_author"
                            ? t("Only the note author can read this note.")
                            : type === "selected_recipients"
                              ? t(
                                  "Only people explicitly selected below can read this note.",
                                )
                              : t(
                                  "Choose the employee, team members and/or other people who can read this note.",
                                )}
                        </p>
                        <label>
                          {t("Note text")}
                          <textarea
                            rows={4}
                            value={draft?.body ?? ""}
                            onChange={(event) =>
                              setDraft(type, {
                                body: event.target.value,
                                saved: false,
                              })
                            }
                          />
                        </label>
                        {type === "selected_recipients" && (
                          <div className="one-on-one-recipient-list">
                            <strong>{t("Select people")}</strong>
                            <input
                              type="search"
                              value={recipientSearch}
                              onChange={(event) =>
                                setRecipientSearch(event.target.value)
                              }
                              placeholder={t("Search employees")}
                              aria-label={t("Search employees")}
                            />
                            {filteredRecipientOptions.map((option) => (
                              <label key={option.userId}>
                                <input
                                  type="checkbox"
                                  checked={
                                    draft?.recipientUserIds.includes(
                                      option.userId,
                                    ) ?? false
                                  }
                                  onChange={(event) =>
                                    setDraft(type, {
                                      recipientUserIds: event.target.checked
                                        ? [
                                            ...(draft?.recipientUserIds ?? []),
                                            option.userId,
                                          ]
                                        : (
                                            draft?.recipientUserIds ?? []
                                          ).filter(
                                            (id) => id !== option.userId,
                                          ),
                                      saved: false,
                                    })
                                  }
                                />
                                {option.firstName} {option.lastName} ·{" "}
                                {option.jobTitle}
                              </label>
                            ))}
                          </div>
                        )}
                        {type === "employee_or_team" && (
                          <div className="one-on-one-recipient-list">
                            <strong>{t("Recipients")}</strong>
                            <input
                              type="search"
                              value={recipientSearch}
                              onChange={(event) =>
                                setRecipientSearch(event.target.value)
                              }
                              placeholder={t("Search employees")}
                              aria-label={t("Search employees")}
                            />
                            {directory.find(
                              (person) => person.id === meetingEmployeeId,
                            )?.userId && (
                              <label>
                                <input
                                  type="checkbox"
                                  checked={draft?.includeEmployee ?? false}
                                  onChange={(event) =>
                                    setDraft(type, {
                                      includeEmployee: event.target.checked,
                                      saved: false,
                                    })
                                  }
                                />
                                {t("Conversation employee")}:{" "}
                                {personName(activeMeetingEmployee)}
                              </label>
                            )}
                            {teams.map((team) => (
                              <label key={team.id}>
                                <input
                                  type="checkbox"
                                  checked={
                                    draft?.teamIds.includes(team.id) ?? false
                                  }
                                  onChange={(event) =>
                                    setDraft(type, {
                                      teamIds: event.target.checked
                                        ? [...(draft?.teamIds ?? []), team.id]
                                        : (draft?.teamIds ?? []).filter(
                                            (id) => id !== team.id,
                                          ),
                                      saved: false,
                                    })
                                  }
                                />
                                {t("Team")}: {team.name} · {team.memberCount}{" "}
                                {t("people")} —{" "}
                                {team.recipientUserIds
                                  .map((id) =>
                                    recipientName(id, recipientOptions),
                                  )
                                  .filter(Boolean)
                                  .join(", ")}
                              </label>
                            ))}
                            {filteredRecipientOptions.map((option) => (
                              <label key={option.userId}>
                                <input
                                  type="checkbox"
                                  checked={
                                    draft?.recipientUserIds.includes(
                                      option.userId,
                                    ) ?? false
                                  }
                                  onChange={(event) =>
                                    setDraft(type, {
                                      recipientUserIds: event.target.checked
                                        ? [
                                            ...(draft?.recipientUserIds ?? []),
                                            option.userId,
                                          ]
                                        : (
                                            draft?.recipientUserIds ?? []
                                          ).filter(
                                            (id) => id !== option.userId,
                                          ),
                                      saved: false,
                                    })
                                  }
                                />
                                {t("Other person")}: {option.firstName}{" "}
                                {option.lastName}
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="one-on-one-note-save-row">
                          <span>
                            {draft?.saved
                              ? t("Sharing state saved")
                              : t("Not shared until saved")}
                          </span>
                          <button
                            type="button"
                            className="button secondary-button"
                            disabled={
                              noteSaving === type || !draft?.body.trim()
                            }
                            onClick={() => void saveNote(type)}
                          >
                            {noteSaving === type
                              ? t("Saving…")
                              : draft?.saved
                                ? t("Save note and sharing")
                                : t("Save note")}
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            {error && (
              <p className="form-error span-two" role="alert">
                {t(error)}
              </p>
            )}
            {savedMeetingId && !editingMeeting && (
              <p className="one-on-one-saved-hint span-two">
                {t(
                  "Conversation saved. You can continue adding independent notes.",
                )}
              </p>
            )}
            <div className="dialog-actions span-two">
              <button
                type="button"
                className="button ghost-button"
                onClick={resetMeetingDialog}
              >
                {t("Close")}
              </button>
              <button className="button primary-button" disabled={busy}>
                {busy
                  ? t("Saving…")
                  : editingMeeting || savedMeetingId
                    ? t("Save changes")
                    : t("Save conversation")}
              </button>
            </div>
          </form>
        </DialogBackdrop>
      )}
    </>
  );
}

function recipientName(userId: number, recipients: RecipientOption[]) {
  const recipient = recipients.find((entry) => entry.userId === userId);
  return recipient ? `${recipient.firstName} ${recipient.lastName}` : "";
}
