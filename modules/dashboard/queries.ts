import { and, asc, desc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  announcementDismissals,
  announcementComments,
  announcementPollResponses,
  announcementPolls,
  announcementReactions,
  announcements,
  companyEvents,
  companyLinks,
  employees,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  peopleTasks,
  reimbursementRequests,
} from "@/db/schema";
import {
  parsePollAnswers,
  parsePollQuestions,
} from "@/modules/announcements/polls";
import { hasOrganizationScope, type CurrentUser } from "@/lib/auth";
import { getDateContext, type DateContext } from "@/modules/shared/date";
import {
  announcementTitleText,
  sanitizeAnnouncementHtml,
} from "@/modules/announcements/content";
import { activeEmployeeCondition } from "@/modules/people/active";

export async function getDashboardData(
  user: CurrentUser,
  date: DateContext = getDateContext(),
) {
  const db = getDb();

  const [pendingLeave, pendingExpenses] =
    user.role === "employee"
      ? [[{ value: 0 }], [{ value: 0 }]]
      : await Promise.all([
          hasOrganizationScope(user)
            ? db
                .select({ value: sql<number>`count(*)` })
                .from(leaveRequests)
                .where(eq(leaveRequests.status, "pending"))
            : db
                .select({ value: sql<number>`count(*)` })
                .from(leaveRequests)
                .innerJoin(
                  employees,
                  eq(leaveRequests.employeeId, employees.id),
                )
                .where(
                  and(
                    eq(leaveRequests.status, "pending"),
                    eq(employees.managerId, user.employeeId ?? -1),
                  ),
                ),
          hasOrganizationScope(user)
            ? db
                .select({ value: sql<number>`count(*)` })
                .from(reimbursementRequests)
                .where(eq(reimbursementRequests.status, "pending"))
            : db
                .select({ value: sql<number>`count(*)` })
                .from(reimbursementRequests)
                .innerJoin(
                  employees,
                  eq(reimbursementRequests.employeeId, employees.id),
                )
                .where(
                  and(
                    eq(reimbursementRequests.status, "pending"),
                    eq(employees.managerId, user.employeeId ?? -1),
                  ),
                ),
        ]);

  const [vacationBalance] = await db
    .select({
      allowance: leaveBalances.allowance,
      used: leaveBalances.used,
      adjustment: leaveBalances.adjustment,
    })
    .from(leaveBalances)
    .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
    .where(
      and(
        eq(leaveBalances.employeeId, user.employeeId ?? -1),
        eq(leaveTypes.code, "vacation"),
        eq(leaveBalances.year, date.year),
      ),
    )
    .limit(1);

  const anniversaryPeople = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      startDate: employees.startDate,
    })
    .from(employees)
    .where(activeEmployeeCondition());

  const whoIsOut = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      endDate: leaveRequests.endDate,
      leaveName: leaveTypes.name,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(
      and(
        eq(leaveRequests.status, "approved"),
        lte(leaveRequests.startDate, date.today),
        gte(leaveRequests.endDate, date.today),
      ),
    );

  const now = new Date().toISOString();
  const [personalTasks, plannedEvents, homeAnnouncements, links, dismissed] =
    await Promise.all([
      db
        .select()
        .from(peopleTasks)
        .where(
          and(
            eq(peopleTasks.assigneeEmployeeId, user.employeeId ?? -1),
            ne(peopleTasks.status, "done"),
          ),
        )
        .orderBy(asc(peopleTasks.dueDate), desc(peopleTasks.createdAt))
        .limit(4),
      db
        .select()
        .from(companyEvents)
        .where(
          and(
            eq(companyEvents.active, true),
            gte(companyEvents.startsAt, `${date.today}T00:00`),
          ),
        )
        .orderBy(asc(companyEvents.startsAt))
        .limit(4),
      db
        .select()
        .from(announcements)
        .where(
          and(
            eq(announcements.active, true),
            lte(announcements.publishedAt, now),
            or(
              isNull(announcements.expiresAt),
              gte(announcements.expiresAt, now),
            ),
          ),
        )
        .orderBy(desc(announcements.pinned), desc(announcements.publishedAt))
        .limit(50),
      db
        .select()
        .from(companyLinks)
        .where(eq(companyLinks.active, true))
        .orderBy(asc(companyLinks.sortOrder), asc(companyLinks.id))
        .limit(8),
      db
        .select({ announcementId: announcementDismissals.announcementId })
        .from(announcementDismissals)
        .where(
          user.userId
            ? or(
                eq(announcementDismissals.userId, user.userId),
                eq(announcementDismissals.userEmail, user.email),
              )
            : eq(announcementDismissals.userEmail, user.email),
        ),
    ]);

  const safeAnnouncements = homeAnnouncements.map((announcement) => ({
    ...announcement,
    title: announcementTitleText(announcement.title),
    body: sanitizeAnnouncementHtml(announcement.body),
  }));
  const dismissedIds = new Set(dismissed.map((item) => item.announcementId));
  const popupAnnouncement = [...safeAnnouncements]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .find((item) => !dismissedIds.has(item.id));

  return {
    pendingApprovals:
      Number(pendingLeave[0]?.value ?? 0) +
      Number(pendingExpenses[0]?.value ?? 0),
    vacationAvailable:
      (vacationBalance?.allowance ?? 0) +
      (vacationBalance?.adjustment ?? 0) -
      (vacationBalance?.used ?? 0),
    anniversaries: upcomingAnniversaries(anniversaryPeople, date.today),
    whoIsOut,
    personalTasks,
    plannedEvents,
    announcements: safeAnnouncements,
    popupAnnouncement: popupAnnouncement ?? null,
    companyLinks: links,
  };
}

function upcomingAnniversaries(
  people: {
    id: number;
    firstName: string;
    lastName: string;
    startDate: string;
  }[],
  today: string,
) {
  const todayDate = new Date(`${today}T12:00:00Z`);
  const year = todayDate.getUTCFullYear();
  return people
    .filter(
      (person) =>
        new Date(`${person.startDate}T12:00:00Z`).getTime() <=
        todayDate.getTime(),
    )
    .map((person) => {
      const started = new Date(`${person.startDate}T12:00:00Z`);
      let next = new Date(
        Date.UTC(year, started.getUTCMonth(), started.getUTCDate(), 12),
      );
      if (next < todayDate) {
        next = new Date(
          Date.UTC(year + 1, started.getUTCMonth(), started.getUTCDate(), 12),
        );
      }
      const daysUntil = Math.round(
        (next.getTime() - todayDate.getTime()) / 86_400_000,
      );
      return {
        ...person,
        years: next.getUTCFullYear() - started.getUTCFullYear(),
        nextDate: next.toISOString().slice(0, 10),
        daysUntil,
      };
    })
    .filter((person) => person.years > 0 && person.daysUntil <= 45)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5);
}

export async function getAnnouncements() {
  const now = new Date().toISOString();
  const rows = await getDb()
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.active, true),
        lte(announcements.publishedAt, now),
        or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now)),
      ),
    )
    .orderBy(desc(announcements.pinned), desc(announcements.publishedAt));
  return rows.map((announcement) => ({
    ...announcement,
    title: announcementTitleText(announcement.title),
    body: sanitizeAnnouncementHtml(announcement.body),
  }));
}

export async function getPublishedAnnouncement(id: number) {
  const now = new Date().toISOString();
  const [announcement] = await getDb()
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.id, id),
        eq(announcements.active, true),
        lte(announcements.publishedAt, now),
        or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now)),
      ),
    )
    .limit(1);
  return announcement
    ? {
        ...announcement,
        title: announcementTitleText(announcement.title),
        body: sanitizeAnnouncementHtml(announcement.body),
      }
    : announcement;
}

export async function getAnnouncementEngagement(
  announcementId: number,
  userEmail: string,
  userId: number | null = null,
) {
  const db = getDb();
  const [comments, reactions] = await Promise.all([
    db
      .select({
        id: announcementComments.id,
        body: announcementComments.body,
        userEmail: announcementComments.userEmail,
        userId: announcementComments.userId,
        createdAt: announcementComments.createdAt,
        // Keep every identifier qualified inside the correlated subquery. Drizzle
        // intentionally leaves raw SQL fragments untouched; unqualified `email`
        // becomes ambiguous once employees and users are joined in D1.
        authorName: sql<string>`coalesce(
          (SELECT comment_employee.first_name || ' ' || comment_employee.last_name
           FROM employees AS comment_employee
           LEFT JOIN users AS comment_user
             ON comment_user.employee_id = comment_employee.id
           WHERE (comment_user.id = announcement_comments.user_id
             OR lower(comment_employee.email) = lower(announcement_comments.user_email))
           LIMIT 1),
          announcement_comments.user_email
        )`.as("author_name"),
      })
      .from(announcementComments)
      .where(eq(announcementComments.announcementId, announcementId))
      .orderBy(
        asc(announcementComments.createdAt),
        asc(announcementComments.id),
      )
      .limit(500),
    db
      .select({
        emoji: announcementReactions.emoji,
        userEmail: announcementReactions.userEmail,
        userId: announcementReactions.userId,
      })
      .from(announcementReactions)
      .where(eq(announcementReactions.announcementId, announcementId))
      .limit(5_000),
  ]);

  return {
    comments,
    reactions: ["👍", "❤️", "🎉", "👏", "😄", "🤔"].map((emoji) => ({
      emoji,
      count: reactions.filter((item) => item.emoji === emoji).length,
      selected: reactions.some(
        (item) =>
          item.emoji === emoji &&
          (userId
            ? item.userId === userId || item.userEmail === userEmail
            : item.userEmail === userEmail),
      ),
    })),
  };
}

export async function getAnnouncementPoll(
  announcementId: number,
  userEmail: string,
  userId: number | null = null,
) {
  const db = getDb();
  const [poll] = await db
    .select()
    .from(announcementPolls)
    .where(
      and(
        eq(announcementPolls.announcementId, announcementId),
        eq(announcementPolls.active, true),
      ),
    )
    .limit(1);
  if (!poll) return null;
  const responses = await db
    .select()
    .from(announcementPollResponses)
    .where(eq(announcementPollResponses.pollId, poll.id))
    .limit(10_000);
  const questions = parsePollQuestions(
    poll.questionsJson,
    poll.question,
    poll.optionsJson,
  );
  const ownResponse = responses.find((response) =>
    userId
      ? response.userId === userId || response.userEmail === userEmail
      : response.userEmail === userEmail,
  );
  return {
    id: poll.id,
    title: poll.question,
    description: poll.description,
    questions,
    answers: parsePollAnswers(ownResponse?.answersJson),
    responseCount: responses.length,
  };
}
