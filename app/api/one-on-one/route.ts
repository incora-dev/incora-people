import { and, eq, inArray, isNull } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  auditEvents,
  employees,
  oneOnOneMeetings,
  oneOnOneConversationNotes,
  oneOnOneNoteRecipients,
  oneOnOnePlans,
  oneOnOneRules,
  orgUnits,
  peopleTasks,
  users,
} from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  oneOnOneCommandSchema,
  type OneOnOneCommand,
} from "@/modules/one-on-one/contracts";
import { parseJsonRequest } from "@/modules/shared/http";
import { getDateContext } from "@/modules/shared/date";
import { addCalendarDays } from "@/modules/people/dates";
import {
  activeEmployeeCondition,
  employeeInvitedField,
} from "@/modules/people/active";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user.isPreview) {
    return Response.json(
      { error: "One-on-one changes are unavailable in employee preview." },
      { status: 403 },
    );
  }
  const access = await getAccessPolicy(user);
  const parsed = await parseJsonRequest(request, oneOnOneCommandSchema);
  if (!parsed.ok) return parsed.response;
  const command = parsed.data;
  const db = getDb();

  if (command.action === "sync") {
    if (!access.managePeople) return forbidden();
    const generatedPlans = await syncHrPlans(user.email, user.employeeId);
    return Response.json({ generatedPlans });
  }

  if (command.action === "rule") {
    if (!access.managePeople) return forbidden();
    const [existing] = await db
      .select()
      .from(oneOnOneRules)
      .where(eq(oneOnOneRules.audience, command.audience))
      .limit(1);
    const [rule] = existing
      ? await db
          .update(oneOnOneRules)
          .set({
            cadenceDays: command.cadenceDays,
            active: command.active,
            updatedByEmail: user.email,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(oneOnOneRules.id, existing.id))
          .returning()
      : await db
          .insert(oneOnOneRules)
          .values({
            audience: command.audience,
            cadenceDays: command.cadenceDays,
            active: command.active,
            updatedByEmail: user.email,
          })
          .returning();
    const generatedPlans = await syncHrPlans(user.email, user.employeeId);
    return Response.json({ rule, generatedPlans });
  }

  if (command.action === "plan.update") {
    const [plan] = await db
      .select()
      .from(oneOnOnePlans)
      .where(eq(oneOnOnePlans.id, command.planId))
      .limit(1);
    if (!plan || !(await canManageEmployee(user, access, plan.employeeId)))
      return forbidden();
    if (
      plan.facilitatorEmail.trim().toLowerCase() !==
        user.email.trim().toLowerCase() &&
      !access.managePeople
    )
      return forbidden();
    const [updated] = await db
      .update(oneOnOnePlans)
      .set({
        cadenceDays: command.cadenceDays,
        nextDueDate: command.nextDueDate,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(oneOnOnePlans.id, plan.id))
      .returning();
    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "one_on_one.plan_schedule_corrected",
      entityType: "one_on_one_plan",
      entityId: String(plan.id),
      details: command.nextDueDate,
    });
    return Response.json({ plan: updated });
  }

  if (command.action === "meeting.update") {
    const [meeting] = await db
      .select()
      .from(oneOnOneMeetings)
      .where(
        and(
          eq(oneOnOneMeetings.id, command.meetingId),
          isNull(oneOnOneMeetings.deletedAt),
        ),
      )
      .limit(1);
    if (
      !meeting ||
      !isMeetingAuthor(meeting, user) ||
      !(await canManageEmployee(user, access, meeting.employeeId))
    )
      return forbidden();
    const [updated] = await db
      .update(oneOnOneMeetings)
      .set({
        heldAt: command.heldAt,
        riskStatus: command.riskStatus,
        reason: command.reason,
        feedback: command.feedback,
        waysToSolve: command.waysToSolve,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(oneOnOneMeetings.id, meeting.id),
          isNull(oneOnOneMeetings.deletedAt),
        ),
      )
      .returning();
    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "one_on_one.feedback_corrected",
      entityType: "one_on_one_meeting",
      entityId: String(meeting.id),
      details: `held_at:${command.heldAt};risk:${command.riskStatus ?? "unassessed"}`,
    });
    return Response.json({ meeting: updated });
  }

  if (command.action === "meeting.delete") {
    const [meeting] = await db
      .select()
      .from(oneOnOneMeetings)
      .where(
        and(
          eq(oneOnOneMeetings.id, command.meetingId),
          isNull(oneOnOneMeetings.deletedAt),
        ),
      )
      .limit(1);
    if (
      !meeting ||
      !isMeetingAuthor(meeting, user) ||
      !(await canManageEmployee(user, access, meeting.employeeId))
    )
      return forbidden();
    const now = new Date().toISOString();
    await db.batch([
      db
        .update(oneOnOneMeetings)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(oneOnOneMeetings.id, meeting.id),
            isNull(oneOnOneMeetings.deletedAt),
          ),
        ),
      db.insert(auditEvents).values({
        actorEmail: user.email,
        action: "one_on_one.meeting_soft_deleted",
        entityType: "one_on_one_meeting",
        entityId: String(meeting.id),
      }),
    ]);
    return Response.json({ ok: true, deletedAt: now });
  }

  if (command.action === "note.save") {
    return saveConversationNote(command, user, access);
  }

  if (command.action === "plan") {
    const [employee] = await db
      .select({ managerId: employees.managerId })
      .from(employees)
      .where(eq(employees.id, command.employeeId))
      .limit(1);
    if (
      !employee ||
      (!access.managePeople && employee.managerId !== user.employeeId)
    )
      return forbidden();
    const facilitatorKind = access.managePeople ? "hr" : "manager";
    const [existing] = await db
      .select()
      .from(oneOnOnePlans)
      .where(
        and(
          eq(oneOnOnePlans.employeeId, command.employeeId),
          eq(oneOnOnePlans.facilitatorEmail, user.email),
        ),
      )
      .limit(1);
    const [plan] = existing
      ? await db
          .update(oneOnOnePlans)
          .set({
            cadenceDays: command.cadenceDays,
            active: command.active,
            nextDueDate:
              existing.nextDueDate ??
              addCalendarDays(getDateContext().today, command.cadenceDays),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(oneOnOnePlans.id, existing.id))
          .returning()
      : await db
          .insert(oneOnOnePlans)
          .values({
            employeeId: command.employeeId,
            facilitatorEmail: user.email,
            facilitatorKind,
            cadenceDays: command.cadenceDays,
            active: command.active,
            nextDueDate: addCalendarDays(
              getDateContext().today,
              command.cadenceDays,
            ),
          })
          .returning();
    return Response.json({ plan });
  }

  if (command.action === "meeting_access") {
    const [existingMeeting] = await db
      .select({
        id: oneOnOneMeetings.id,
        facilitatorEmail: oneOnOneMeetings.facilitatorEmail,
        planId: oneOnOneMeetings.planId,
      })
      .from(oneOnOneMeetings)
      .where(eq(oneOnOneMeetings.id, command.meetingId))
      .limit(1);
    if (!existingMeeting || existingMeeting.facilitatorEmail !== user.email) {
      return forbidden();
    }
    const [meetingPlan] = await db
      .select({ facilitatorKind: oneOnOnePlans.facilitatorKind })
      .from(oneOnOnePlans)
      .where(eq(oneOnOnePlans.id, existingMeeting.planId))
      .limit(1);
    const [meeting] = await db
      .update(oneOnOneMeetings)
      .set({
        sharedWithEmployee: command.sharedWithEmployee,
        sharedWithManager:
          meetingPlan?.facilitatorKind === "hr" && command.sharedWithManager,
      })
      .where(eq(oneOnOneMeetings.id, command.meetingId))
      .returning();
    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "one_on_one.access_updated",
      entityType: "one_on_one_meeting",
      entityId: String(meeting.id),
    });
    return Response.json({ meeting });
  }

  if (command.action !== "meeting") return forbidden();
  return recordConversation(command, user, access);
}

function isMeetingAuthor(
  meeting: {
    creatorUserId: number | null;
    facilitatorEmail: string;
  },
  user: { userId: number | null; email: string },
) {
  return (
    (user.userId !== null && meeting.creatorUserId === user.userId) ||
    meeting.facilitatorEmail.trim().toLowerCase() ===
      user.email.trim().toLowerCase()
  );
}

async function canManageEmployee(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  access: Awaited<ReturnType<typeof getAccessPolicy>>,
  employeeId: number,
) {
  if (access.managePeople) return true;
  if (user.employeeId === null) return false;
  const [employee] = await getDb()
    .select({ managerId: employees.managerId, invited: employeeInvitedField() })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  // Only HR works with people who were not invited yet.
  return employee?.managerId === user.employeeId && employee.invited;
}

async function recordConversation(
  command: Extract<OneOnOneCommand, { action: "meeting" }>,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  access: Awaited<ReturnType<typeof getAccessPolicy>>,
) {
  const db = getDb();
  const requestId = command.requestId ?? crypto.randomUUID();
  const [replayed] = await db
    .select()
    .from(oneOnOneMeetings)
    .where(eq(oneOnOneMeetings.requestId, requestId))
    .limit(1);
  if (replayed) return Response.json({ meeting: replayed, replayed: true });

  let plan: typeof oneOnOnePlans.$inferSelect | undefined;
  if (command.planId !== undefined) {
    [plan] = await db
      .select()
      .from(oneOnOnePlans)
      .where(eq(oneOnOnePlans.id, command.planId))
      .limit(1);
    if (
      !plan ||
      plan.facilitatorEmail.trim().toLowerCase() !==
        user.email.trim().toLowerCase()
    )
      return forbidden();
  }
  const employeeId = command.employeeId ?? plan?.employeeId;
  if (!employeeId || (plan && plan.employeeId !== employeeId))
    return forbidden();
  if (!(await canManageEmployee(user, access, employeeId))) return forbidden();

  if (!plan) {
    [plan] = await db
      .select()
      .from(oneOnOnePlans)
      .where(
        and(
          eq(oneOnOnePlans.employeeId, employeeId),
          eq(oneOnOnePlans.facilitatorEmail, user.email),
        ),
      )
      .limit(1);
  }
  const cadenceDays = plan?.cadenceDays ?? command.cadenceDays;
  const nextDueDate = addCalendarDays(command.heldAt, cadenceDays);
  if (!nextDueDate)
    return Response.json({ error: "Invalid meeting date." }, { status: 400 });

  const d1 = getD1();
  const now = new Date().toISOString();
  const facilitatorKind =
    plan?.facilitatorKind ?? (access.managePeople ? "hr" : "manager");
  const statements = plan
    ? [
        d1
          .prepare(
            "UPDATE one_on_one_plans SET cadence_days=?,next_due_date=?,active=1,updated_at=? WHERE id=? AND employee_id=? AND facilitator_email=?",
          )
          .bind(cadenceDays, nextDueDate, now, plan.id, employeeId, user.email),
      ]
    : [
        d1
          .prepare(
            "INSERT OR IGNORE INTO one_on_one_plans(employee_id,facilitator_email,facilitator_kind,cadence_days,active,created_at,updated_at,next_due_date) VALUES(?,?,?,?,1,?,?,?)",
          )
          .bind(
            employeeId,
            user.email,
            facilitatorKind,
            cadenceDays,
            now,
            now,
            nextDueDate,
          ),
        d1
          .prepare(
            "UPDATE one_on_one_plans SET cadence_days=?,next_due_date=?,active=1,updated_at=? WHERE employee_id=? AND facilitator_email=?",
          )
          .bind(cadenceDays, nextDueDate, now, employeeId, user.email),
      ];
  statements.push(
    d1
      .prepare(
        `INSERT INTO one_on_one_meetings(
          plan_id,employee_id,facilitator_email,creator_user_id,held_at,
          risk_status,reason,feedback,ways_to_solve,notes,
          shared_with_employee,shared_with_manager,created_at,updated_at,request_id
        ) SELECT id,?,?,?,?,?,?,?,?,?,?,?, ?,?,?
            FROM one_on_one_plans
           WHERE ${plan ? "id=? AND " : ""}employee_id=? AND facilitator_email=?
        RETURNING id`,
      )
      .bind(
        employeeId,
        user.email,
        user.userId,
        command.heldAt,
        command.riskStatus,
        command.reason,
        command.feedback,
        command.waysToSolve,
        command.notes,
        Number(command.sharedWithEmployee),
        Number(command.sharedWithManager && facilitatorKind === "hr"),
        now,
        now,
        requestId,
        ...(plan ? [plan.id] : []),
        employeeId,
        user.email,
      ),
    d1
      .prepare(
        `INSERT INTO audit_events(actor_email,action,entity_type,entity_id,details,created_at)
         SELECT ?, 'one_on_one.recorded', 'one_on_one_meeting', CAST(id AS TEXT), ?, ?
           FROM one_on_one_meetings WHERE request_id=?`,
      )
      .bind(user.email, `${employeeId}: ${command.heldAt}`, now, requestId),
  );
  try {
    await d1.batch(statements);
  } catch {
    const [existing] = await db
      .select()
      .from(oneOnOneMeetings)
      .where(eq(oneOnOneMeetings.requestId, requestId))
      .limit(1);
    if (existing) return Response.json({ meeting: existing, replayed: true });
    return Response.json(
      { error: "Could not save the conversation." },
      { status: 409 },
    );
  }
  const [meeting] = await db
    .select()
    .from(oneOnOneMeetings)
    .where(eq(oneOnOneMeetings.requestId, requestId))
    .limit(1);
  if (!meeting)
    return Response.json(
      { error: "Could not save the conversation." },
      { status: 409 },
    );

  await db
    .update(peopleTasks)
    .set({ status: "done", completedAt: now })
    .where(
      and(
        eq(peopleTasks.category, "general"),
        eq(peopleTasks.createdByEmail, user.email),
        eq(
          peopleTasks.description,
          `Автоматично створено з плану one-on-one #${meeting.planId}.`,
        ),
        eq(peopleTasks.status, "todo"),
      ),
    );
  if (user.employeeId && plan?.active !== false) {
    const [person] = await db
      .select({ firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    if (person) {
      const title = `Провести one-on-one: ${person.firstName} ${person.lastName}`;
      const [nextTask] = await db
        .select({ id: peopleTasks.id })
        .from(peopleTasks)
        .where(
          and(
            eq(peopleTasks.assigneeEmployeeId, user.employeeId),
            eq(peopleTasks.category, "general"),
            eq(peopleTasks.title, title),
            eq(peopleTasks.status, "todo"),
          ),
        )
        .limit(1);
      if (!nextTask) {
        await db.insert(peopleTasks).values({
          title,
          description: `Автоматично створено з плану one-on-one #${meeting.planId}.`,
          category: "general",
          assigneeEmployeeId: user.employeeId,
          dueDate: nextDueDate,
          createdByEmail: user.email,
        });
      }
    }
  }
  return Response.json({ meeting }, { status: 201 });
}

async function saveConversationNote(
  command: Extract<OneOnOneCommand, { action: "note.save" }>,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  access: Awaited<ReturnType<typeof getAccessPolicy>>,
) {
  if (user.userId === null) return forbidden();
  const db = getDb();
  const [meeting] = await db
    .select()
    .from(oneOnOneMeetings)
    .where(
      and(
        eq(oneOnOneMeetings.id, command.meetingId),
        isNull(oneOnOneMeetings.deletedAt),
      ),
    )
    .limit(1);
  if (
    !meeting ||
    !isMeetingAuthor(meeting, user) ||
    !(await canManageEmployee(user, access, meeting.employeeId))
  )
    return forbidden();

  const requestedIds = new Set(command.recipientUserIds);
  const sourceByUser = new Map<
    number,
    { source: string; sourceId: string | null }
  >();
  if (command.noteType === "private_author") {
    if (requestedIds.size || command.includeEmployee || command.teamIds.length)
      return Response.json(
        { error: "Private notes cannot have recipients." },
        { status: 400 },
      );
  } else {
    if (
      command.noteType === "selected_recipients" &&
      (!requestedIds.size || command.includeEmployee || command.teamIds.length)
    )
      return Response.json(
        { error: "Choose one or more people for this note." },
        { status: 400 },
      );
    if (
      command.noteType === "employee_or_team" &&
      !requestedIds.size &&
      !command.includeEmployee &&
      !command.teamIds.length
    )
      return Response.json(
        { error: "Choose the employee, a team, or other recipients." },
        { status: 400 },
      );
    const employee = await getEmployeeRecipient(
      meeting.employeeId,
      user,
      access,
      command.includeEmployee,
    );
    if (command.includeEmployee) {
      if (!employee)
        return Response.json(
          { error: "The conversation employee has no eligible account." },
          { status: 409 },
        );
      sourceByUser.set(employee.userId, {
        source: "employee",
        sourceId: String(employee.employeeId),
      });
    }
    if (requestedIds.size) {
      const rows = await db
        .select({
          userId: users.id,
          employeeId: employees.id,
          managerId: employees.managerId,
        })
        .from(users)
        .innerJoin(employees, eq(users.employeeId, employees.id))
        .where(
          and(
            inArray(users.id, [...requestedIds]),
            eq(users.enabled, true),
            activeEmployeeCondition(),
          ),
        );
      if (
        rows.length !== requestedIds.size ||
        rows.some(
          (row) =>
            !isWithinEmployeeScope(user, access, row.employeeId, row.managerId),
        )
      )
        return forbidden();
      for (const row of rows)
        sourceByUser.set(row.userId, {
          source: "person",
          sourceId: String(row.employeeId),
        });
    }
    if (command.teamIds.length) {
      const teamPeople = await db
        .select({
          teamId: employees.teamUnitId,
          employeeId: employees.id,
          managerId: employees.managerId,
        })
        .from(employees)
        .where(
          and(
            inArray(employees.teamUnitId, command.teamIds),
            activeEmployeeCondition(),
          ),
        );
      if (
        command.teamIds.some(
          (id) => !teamPeople.some((person) => person.teamId === id),
        ) ||
        teamPeople.some(
          (person) =>
            !isWithinEmployeeScope(
              user,
              access,
              person.employeeId,
              person.managerId,
            ),
        )
      )
        return forbidden();
      const teamRows = await db
        .select({
          teamId: orgUnits.id,
          teamName: orgUnits.name,
          userId: users.id,
          employeeId: employees.id,
          managerId: employees.managerId,
        })
        .from(orgUnits)
        .innerJoin(employees, eq(employees.teamUnitId, orgUnits.id))
        .innerJoin(users, eq(users.employeeId, employees.id))
        .where(
          and(
            inArray(orgUnits.id, command.teamIds),
            eq(orgUnits.type, "team"),
            eq(orgUnits.active, true),
            activeEmployeeCondition(),
            eq(users.enabled, true),
          ),
        );
      const foundTeams = new Set(teamRows.map((row) => row.teamId));
      if (
        command.teamIds.some((id) => !foundTeams.has(id)) ||
        teamRows.some(
          (row) =>
            !isWithinEmployeeScope(user, access, row.employeeId, row.managerId),
        )
      )
        return forbidden();
      for (const row of teamRows)
        sourceByUser.set(row.userId, {
          source: "team",
          sourceId: String(row.teamId),
        });
    }
    if (!sourceByUser.size)
      return Response.json(
        { error: "No eligible recipients were found." },
        { status: 409 },
      );
  }

  const noteId = command.noteId ?? crypto.randomUUID();
  const [existing] = await db
    .select()
    .from(oneOnOneConversationNotes)
    .where(eq(oneOnOneConversationNotes.id, noteId))
    .limit(1);
  if (
    existing &&
    (existing.authorUserId !== user.userId ||
      existing.meetingId !== meeting.id ||
      existing.deletedAt)
  )
    return forbidden();
  const now = new Date().toISOString();
  const d1 = getD1();
  const statements = [
    existing
      ? d1
          .prepare(
            "UPDATE one_on_one_conversation_notes SET body=?,note_type=?,updated_at=? WHERE id=? AND author_user_id=? AND meeting_id=? AND deleted_at IS NULL",
          )
          .bind(
            command.body,
            command.noteType,
            now,
            noteId,
            user.userId,
            meeting.id,
          )
      : d1
          .prepare(
            "INSERT INTO one_on_one_conversation_notes(id,meeting_id,author_user_id,note_type,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            noteId,
            meeting.id,
            user.userId,
            command.noteType,
            command.body,
            now,
            now,
          ),
  ];
  const activeRecipients = await db
    .select()
    .from(oneOnOneNoteRecipients)
    .where(
      and(
        eq(oneOnOneNoteRecipients.noteId, noteId),
        isNull(oneOnOneNoteRecipients.revokedAt),
      ),
    );
  const desired =
    command.noteType === "private_author"
      ? new Map<number, { source: string; sourceId: string | null }>()
      : sourceByUser;
  for (const current of activeRecipients) {
    const wanted = desired.get(current.userId);
    if (
      !wanted ||
      wanted.source !== current.grantSource ||
      wanted.sourceId !== current.sourceId
    ) {
      statements.push(
        d1
          .prepare(
            "UPDATE one_on_one_note_recipients SET revoked_at=? WHERE id=? AND revoked_at IS NULL",
          )
          .bind(now, current.id),
      );
    }
  }
  const activeByUser = new Map(
    activeRecipients.map((recipient) => [recipient.userId, recipient]),
  );
  for (const [recipientUserId, source] of desired) {
    const current = activeByUser.get(recipientUserId);
    if (
      current &&
      current.grantSource === source.source &&
      current.sourceId === source.sourceId
    )
      continue;
    statements.push(
      d1
        .prepare(
          "INSERT INTO one_on_one_note_recipients(note_id,user_id,granted_by_user_id,grant_source,source_id,granted_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          noteId,
          recipientUserId,
          user.userId,
          source.source,
          source.sourceId,
          now,
        ),
    );
  }
  statements.push(
    d1
      .prepare(
        "INSERT INTO audit_events(actor_email,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        user.email,
        existing ? "one_on_one.note_updated" : "one_on_one.note_created",
        "one_on_one_note",
        noteId,
        `${command.noteType};recipients:${desired.size}`,
        now,
      ),
  );
  try {
    await d1.batch(statements);
  } catch {
    return Response.json(
      { error: "Could not save note sharing safely." },
      { status: 409 },
    );
  }
  return Response.json(
    { ok: true, noteId, recipientCount: desired.size, canRead: true },
    { status: existing ? 200 : 201 },
  );
}

async function getEmployeeRecipient(
  employeeId: number,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  access: Awaited<ReturnType<typeof getAccessPolicy>>,
  required: boolean,
) {
  if (!required) return null;
  const [row] = await getDb()
    .select({
      userId: users.id,
      employeeId: employees.id,
      managerId: employees.managerId,
    })
    .from(employees)
    .innerJoin(users, eq(users.employeeId, employees.id))
    .where(
      and(
        eq(employees.id, employeeId),
        activeEmployeeCondition(),
        eq(users.enabled, true),
      ),
    )
    .limit(1);
  return row &&
    isWithinEmployeeScope(user, access, row.employeeId, row.managerId)
    ? row
    : null;
}

function isWithinEmployeeScope(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  access: Awaited<ReturnType<typeof getAccessPolicy>>,
  employeeId: number,
  managerId: number | null,
) {
  return (
    access.managePeople ||
    employeeId === user.employeeId ||
    managerId === user.employeeId
  );
}

async function syncHrPlans(
  facilitatorEmail: string,
  facilitatorEmployeeId: number | null,
) {
  const db = getDb();
  const [rules, people] = await Promise.all([
    db.select().from(oneOnOneRules),
    db
      .select({
        id: employees.id,
        jobTitle: employees.jobTitle,
        department: employees.department,
        probationEnd: employees.probationEnd,
        managerId: employees.managerId,
        firstName: employees.firstName,
        lastName: employees.lastName,
      })
      .from(employees)
      // HR plans are an exception to "not invited is not active": onboarding
      // and probation 1:1s are planned for newcomers before their invitation.
      .where(eq(employees.status, "active")),
  ]);
  const activeRules = rules.filter((rule) => rule.active);
  const { today } = getDateContext();
  const managerIds = new Set(
    people
      .map((person) => person.managerId)
      .filter((id): id is number => Boolean(id)),
  );
  let changed = 0;
  for (const person of people) {
    const matching = activeRules.filter((rule) => {
      if (rule.audience === "probation") {
        return Boolean(person.probationEnd && person.probationEnd >= today);
      }
      if (rule.audience === "managers") return managerIds.has(person.id);
      const role = `${person.jobTitle} ${person.department}`.toLowerCase();
      return /(engineer|developer|qa|quality|engineering|розроб)/.test(role);
    });
    if (!matching.length) continue;
    const cadenceDays = Math.min(...matching.map((rule) => rule.cadenceDays));
    const [existing] = await db
      .select()
      .from(oneOnOnePlans)
      .where(
        and(
          eq(oneOnOnePlans.employeeId, person.id),
          eq(oneOnOnePlans.facilitatorEmail, facilitatorEmail),
        ),
      )
      .limit(1);
    let planId: number;
    let dueDate: string;
    if (existing) {
      await db
        .update(oneOnOnePlans)
        .set({ cadenceDays, active: true, updatedAt: new Date().toISOString() })
        .where(eq(oneOnOnePlans.id, existing.id));
      planId = existing.id;
      dueDate =
        existing.nextDueDate ??
        addCalendarDays(existing.createdAt.slice(0, 10), cadenceDays) ??
        today;
      if (!existing.nextDueDate) {
        await db
          .update(oneOnOnePlans)
          .set({ nextDueDate: dueDate })
          .where(eq(oneOnOnePlans.id, existing.id));
      }
    } else {
      const [plan] = await db
        .insert(oneOnOnePlans)
        .values({
          employeeId: person.id,
          facilitatorEmail,
          facilitatorKind: "hr",
          cadenceDays,
          active: true,
          nextDueDate: addCalendarDays(today, cadenceDays),
        })
        .returning();
      planId = plan.id;
      dueDate = addCalendarDays(today, cadenceDays) ?? today;
    }
    if (facilitatorEmployeeId) {
      const title = `Провести one-on-one: ${person.firstName} ${person.lastName}`;
      const [task] = await db
        .select({ id: peopleTasks.id })
        .from(peopleTasks)
        .where(
          and(
            eq(peopleTasks.assigneeEmployeeId, facilitatorEmployeeId),
            eq(peopleTasks.category, "general"),
            eq(peopleTasks.title, title),
            eq(peopleTasks.status, "todo"),
          ),
        )
        .limit(1);
      if (!task) {
        await db.insert(peopleTasks).values({
          title,
          description: `Автоматично створено з плану one-on-one #${planId}.`,
          category: "general",
          assigneeEmployeeId: facilitatorEmployeeId,
          dueDate,
          createdByEmail: facilitatorEmail,
        });
      }
    }
    changed += 1;
  }
  return changed;
}

function forbidden() {
  return Response.json(
    { error: "One-on-one access required." },
    { status: 403 },
  );
}
