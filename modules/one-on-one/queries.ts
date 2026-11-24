import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  employees,
  oneOnOneConversationNotes,
  oneOnOneMeetings,
  oneOnOneNoteRecipients,
  oneOnOnePlans,
  oneOnOneRules,
  orgUnits,
  users,
} from "@/db/schema";
import type { AccessPolicy, CurrentUser } from "@/lib/auth";
import { addCalendarDays } from "@/modules/people/dates";
import { getDateContext } from "@/modules/shared/date";
import {
  canReadConversationNote,
  filterVisibleOneOnOnePlans,
} from "@/modules/one-on-one/domain";
import { employeeInvitedField } from "@/modules/people/active";

type PersonRow = {
  id: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
  team: string | null;
  teamUnitId: number | null;
  status: string;
  invited: boolean;
  managerId: number | null;
  probationEnd: string | null;
};

function dueDateForPlan(
  plan: typeof oneOnOnePlans.$inferSelect,
  meetings: (typeof oneOnOneMeetings.$inferSelect)[],
) {
  if (plan.nextDueDate) return plan.nextDueDate;
  const latest = [...meetings].sort(
    (a, b) => b.heldAt.localeCompare(a.heldAt) || b.id - a.id,
  )[0];
  return addCalendarDays(
    latest?.heldAt.slice(0, 10) ?? plan.createdAt.slice(0, 10),
    plan.cadenceDays,
  );
}

export async function getOneOnOneWorkspace(
  user: CurrentUser,
  access: AccessPolicy,
) {
  const db = getDb();
  const [people, accountRows, allPlans, activeTeams] = await Promise.all([
    db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        jobTitle: employees.jobTitle,
        team: employees.team,
        teamUnitId: employees.teamUnitId,
        status: employees.status,
        invited: employeeInvitedField(),
        managerId: employees.managerId,
        probationEnd: employees.probationEnd,
      })
      .from(employees)
      .orderBy(
        asc(employees.firstName),
        asc(employees.lastName),
        asc(employees.id),
      ),
    db
      .select({
        id: users.id,
        email: users.email,
        employeeId: users.employeeId,
        enabled: users.enabled,
      })
      .from(users),
    db.select().from(oneOnOnePlans).orderBy(asc(oneOnOnePlans.employeeId)),
    db
      .select({ id: orgUnits.id, name: orgUnits.name })
      .from(orgUnits)
      .where(and(eq(orgUnits.type, "team"), eq(orgUnits.active, true)))
      .orderBy(asc(orgUnits.sortOrder), asc(orgUnits.name)),
  ]);

  const allPeople = people as PersonRow[];
  // Not invited people are visible only to people managers (HR / Super Admin).
  const scopedPeople = allPeople.filter(
    (person) =>
      access.managePeople ||
      person.id === user.employeeId ||
      (person.managerId === user.employeeId && person.invited),
  );
  const scopedIds = scopedPeople.map((person) => person.id);
  const peopleById = new Map(allPeople.map((person) => [person.id, person]));
  const usersByEmployee = new Map(
    accountRows
      .filter((account) => account.employeeId !== null)
      .map((account) => [account.employeeId as number, account]),
  );
  const visiblePlans = filterVisibleOneOnOnePlans(allPlans, allPeople, {
    managePeople: access.managePeople,
    email: user.email,
    employeeId: user.employeeId,
  }).filter((plan) => scopedIds.includes(plan.employeeId));

  const meetingRows = scopedIds.length
    ? await db
        .select()
        .from(oneOnOneMeetings)
        .where(
          and(
            inArray(oneOnOneMeetings.employeeId, scopedIds),
            isNull(oneOnOneMeetings.deletedAt),
          ),
        )
        .orderBy(desc(oneOnOneMeetings.createdAt), desc(oneOnOneMeetings.id))
    : [];
  const meetingIds = meetingRows.map((meeting) => meeting.id);
  const noteRows = meetingIds.length
    ? await db
        .select()
        .from(oneOnOneConversationNotes)
        .where(
          and(
            inArray(oneOnOneConversationNotes.meetingId, meetingIds),
            isNull(oneOnOneConversationNotes.deletedAt),
          ),
        )
        .orderBy(
          desc(oneOnOneConversationNotes.createdAt),
          desc(oneOnOneConversationNotes.id),
        )
    : [];
  const noteIds = noteRows.map((note) => note.id);
  const recipientRows = noteIds.length
    ? await db
        .select()
        .from(oneOnOneNoteRecipients)
        .where(
          and(
            inArray(oneOnOneNoteRecipients.noteId, noteIds),
            isNull(oneOnOneNoteRecipients.revokedAt),
          ),
        )
    : [];
  const recipientsByNote = new Map<string, typeof recipientRows>();
  for (const recipient of recipientRows) {
    recipientsByNote.set(recipient.noteId, [
      ...(recipientsByNote.get(recipient.noteId) ?? []),
      recipient,
    ]);
  }
  const notesByMeeting = new Map<number, typeof noteRows>();
  for (const note of noteRows) {
    notesByMeeting.set(note.meetingId, [
      ...(notesByMeeting.get(note.meetingId) ?? []),
      note,
    ]);
  }

  const peopleByTeam = new Map<number, PersonRow[]>();
  for (const person of allPeople) {
    if (person.teamUnitId === null) continue;
    peopleByTeam.set(person.teamUnitId, [
      ...(peopleByTeam.get(person.teamUnitId) ?? []),
      person,
    ]);
  }
  const scopedPeopleSet = new Set(scopedIds);
  const teams = activeTeams.flatMap((team) => {
    const members = peopleByTeam.get(team.id) ?? [];
    // A manager only gets a selectable team if that team is fully inside
    // their existing people scope; team sharing must not grant new directory
    // access as a side effect.
    if (
      !members.length ||
      (!access.managePeople &&
        members.some((member) => !scopedPeopleSet.has(member.id)))
    )
      return [];
    return [
      {
        id: team.id,
        name: team.name,
        memberCount: members.filter((member) => isActivePerson(member)).length,
        recipientUserIds: members.flatMap((member) => {
          const account = usersByEmployee.get(member.id);
          return isActivePerson(member) && account?.enabled ? [account.id] : [];
        }),
      },
    ];
  });

  const today = getDateContext().today;
  const visibleMeeting = (meeting: (typeof meetingRows)[number]) => {
    const employee = peopleById.get(meeting.employeeId);
    if (!employee) return null;
    const isAuthor =
      (user.userId !== null && meeting.creatorUserId === user.userId) ||
      meeting.facilitatorEmail.trim().toLowerCase() ===
        user.email.trim().toLowerCase();
    const isEmployee = employee.id === user.employeeId;
    const isResponsibleManager = employee.managerId === user.employeeId;
    const canReadStructured =
      access.managePeople || isAuthor || isResponsibleManager;
    const notes: {
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
    }[] = [];

    // Preserve the exact historical sharing flags. Legacy notes are never
    // widened into the newer recipient-based note model.
    if (
      meeting.notes.trim() &&
      (isAuthor ||
        (isEmployee && meeting.sharedWithEmployee) ||
        (isResponsibleManager && meeting.sharedWithManager))
    ) {
      notes.push({
        id: `legacy-${meeting.id}`,
        noteType: "legacy",
        body: meeting.notes,
        authorUserId: meeting.creatorUserId ?? 0,
        recipients: [],
        createdAt: meeting.createdAt,
        updatedAt: meeting.updatedAt,
        canEdit: false,
      });
    }

    for (const note of notesByMeeting.get(meeting.id) ?? []) {
      const recipients = recipientsByNote.get(note.id) ?? [];
      const isNoteAuthor =
        user.userId !== null && note.authorUserId === user.userId;
      const recipientUserIds = recipients.map((recipient) => recipient.userId);
      if (
        !canReadConversationNote(
          { authorUserId: note.authorUserId, recipientUserIds },
          user.userId,
        )
      )
        continue;
      notes.push({
        id: note.id,
        noteType: note.noteType,
        body: note.body,
        authorUserId: note.authorUserId,
        recipients: isNoteAuthor
          ? recipients.map((recipient) => ({
              userId: recipient.userId,
              grantSource: recipient.grantSource,
              sourceId: recipient.sourceId,
            }))
          : [],
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        canEdit: isNoteAuthor && !user.isPreview,
      });
    }

    return {
      ...meeting,
      riskStatus: canReadStructured ? meeting.riskStatus : null,
      reason: canReadStructured ? meeting.reason : "",
      feedback: canReadStructured ? meeting.feedback : "",
      waysToSolve: canReadStructured ? meeting.waysToSolve : "",
      notes,
      canReadStructured,
      canManageMeeting: !user.isPreview && isAuthor,
    };
  };

  const safeMeetings = meetingRows.flatMap((meeting) => {
    const safe = visibleMeeting(meeting);
    return safe ? [safe] : [];
  });
  const meetingsByPlan = new Map<number, typeof safeMeetings>();
  for (const meeting of safeMeetings) {
    meetingsByPlan.set(meeting.planId, [
      ...(meetingsByPlan.get(meeting.planId) ?? []),
      meeting,
    ]);
  }
  const plans = visiblePlans.flatMap((plan) => {
    const person = peopleById.get(plan.employeeId);
    if (!person) return [];
    const planMeetings = meetingRows.filter(
      (meeting) => meeting.planId === plan.id,
    );
    const dueAt = dueDateForPlan(plan, planMeetings);
    return [
      {
        ...plan,
        canEdit:
          !user.isPreview &&
          (access.managePeople ||
            plan.facilitatorEmail.trim().toLowerCase() ===
              user.email.trim().toLowerCase()),
        employee: {
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          jobTitle: person.jobTitle,
          team: person.team,
          managerId: person.managerId,
          probationEnd: person.probationEnd,
        },
        manager: person.managerId
          ? (peopleById.get(person.managerId) ?? null)
          : null,
        lastMeetingAt:
          [...planMeetings].sort(
            (a, b) => b.heldAt.localeCompare(a.heldAt) || b.id - a.id,
          )[0]?.heldAt ?? null,
        dueAt,
        overdue: plan.active && dueAt < today,
        meetings: meetingsByPlan.get(plan.id) ?? [],
      },
    ];
  });

  const activePlansByEmployee = new Map<number, typeof plans>();
  for (const plan of plans.filter((entry) => entry.active)) {
    activePlansByEmployee.set(plan.employeeId, [
      ...(activePlansByEmployee.get(plan.employeeId) ?? []),
      plan,
    ]);
  }
  const meetingCounts = new Map<number, number>();
  const latestMeetingDates = new Map<number, string>();
  for (const meeting of safeMeetings) {
    meetingCounts.set(
      meeting.employeeId,
      (meetingCounts.get(meeting.employeeId) ?? 0) + 1,
    );
    const previous = latestMeetingDates.get(meeting.employeeId);
    if (!previous || meeting.heldAt > previous)
      latestMeetingDates.set(meeting.employeeId, meeting.heldAt);
  }

  const directory = scopedPeople.map((person) => {
    const activePlans = activePlansByEmployee.get(person.id) ?? [];
    const account = usersByEmployee.get(person.id);
    return {
      ...person,
      userId: account?.id ?? null,
      canManage:
        !user.isPreview &&
        (access.managePeople || person.managerId === user.employeeId),
      manager: person.managerId
        ? (peopleById.get(person.managerId) ?? null)
        : null,
      meetingCount: meetingCounts.get(person.id) ?? 0,
      lastConversationDate: latestMeetingDates.get(person.id) ?? null,
      nextDueDate: activePlans.map((plan) => plan.dueAt).sort()[0] ?? null,
    };
  });

  const recipientOptions = scopedPeople
    .filter((person) => isActivePerson(person))
    .flatMap((person) => {
      const account = usersByEmployee.get(person.id);
      return account?.enabled
        ? [
            {
              userId: account.id,
              employeeId: person.id,
              firstName: person.firstName,
              lastName: person.lastName,
              jobTitle: person.jobTitle,
              teamUnitId: person.teamUnitId,
            },
          ]
        : [];
    });
  const rules = access.managePeople
    ? await db.select().from(oneOnOneRules).orderBy(asc(oneOnOneRules.audience))
    : [];

  return {
    plans,
    // People a 1:1 can be set up and recorded for. HR may do this for
    // newcomers before their invitation; scopedPeople already hides not
    // invited people from everyone else.
    people: scopedPeople
      .filter(
        (person) =>
          isActivePerson(person) ||
          (access.managePeople && person.status === "active"),
      )
      .map((person) => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        jobTitle: person.jobTitle,
        team: person.team,
        managerId: person.managerId,
        probationEnd: person.probationEnd,
      })),
    directory,
    conversations: safeMeetings,
    recipientOptions,
    teams,
    rules,
    canManageHr: access.managePeople,
    currentEmail: user.email,
    currentUserId: user.userId,
    currentName: allPeople.find((person) => person.id === user.employeeId)
      ? `${allPeople.find((person) => person.id === user.employeeId)?.firstName ?? ""} ${allPeople.find((person) => person.id === user.employeeId)?.lastName ?? ""}`.trim()
      : user.email,
    today,
    readOnlyPreview: user.isPreview === true,
  };
}

/** Employed and invited to the system; see modules/people/active.ts. */
function isActivePerson(person: { status: string; invited: boolean }) {
  return person.status === "active" && person.invited;
}
