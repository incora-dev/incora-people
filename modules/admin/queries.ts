import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accessPolicies,
  announcementDeliveries,
  announcements,
  announcementPolls,
  companyEvents,
  companyHolidays,
  companyLinks,
  employees,
  employmentTypes,
  leaveBalances,
  leaveTypes,
  orgUnits,
  reimbursementPolicies,
  referenceValues,
  systemSettings,
  timeProjects,
  users,
} from "@/db/schema";
import { parsePollQuestions } from "@/modules/announcements/polls";
import { getDateContext, type DateContext } from "@/modules/shared/date";
import { getDataIntegrityReport } from "@/modules/admin/integrity";
import { sanitizeAnnouncementHtml } from "@/modules/announcements/content";

export async function getAdminSettingsData(
  date: DateContext = getDateContext(),
) {
  const db = getDb();
  const [
    policies,
    types,
    people,
    balances,
    expensePolicies,
    units,
    reporting,
    holidays,
    projects,
    dictionaries,
    employmentTypeRows,
    integrity,
    settingsRows,
  ] = await Promise.all([
    db.select().from(accessPolicies).orderBy(accessPolicies.id),
    db.select().from(leaveTypes).orderBy(leaveTypes.id),
    db
      .select({
        userId: users.id,
        email: users.email,
        role: users.role,
        employeeId: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        jobTitle: employees.jobTitle,
        manageProjects: users.manageProjects,
      })
      .from(users)
      .leftJoin(employees, eq(users.employeeId, employees.id))
      .orderBy(employees.firstName),
    db
      .select({
        id: leaveBalances.id,
        employeeId: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        leaveTypeId: leaveTypes.id,
        typeName: leaveTypes.name,
        color: leaveTypes.color,
        allowance: leaveBalances.allowance,
        used: leaveBalances.used,
        adjustment: leaveBalances.adjustment,
        year: leaveBalances.year,
      })
      .from(leaveBalances)
      .innerJoin(employees, eq(leaveBalances.employeeId, employees.id))
      .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
      .where(eq(leaveBalances.year, date.year))
      .orderBy(employees.firstName, leaveTypes.id),
    db.select().from(reimbursementPolicies).orderBy(reimbursementPolicies.id),
    db.select().from(orgUnits).orderBy(orgUnits.sortOrder, orgUnits.id),
    db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        jobTitle: employees.jobTitle,
        division: employees.division,
        department: employees.department,
        team: employees.team,
        managerId: employees.managerId,
        divisionUnitId: employees.divisionUnitId,
        departmentUnitId: employees.departmentUnitId,
        teamUnitId: employees.teamUnitId,
      })
      .from(employees)
      .orderBy(employees.firstName),
    db.select().from(companyHolidays).orderBy(companyHolidays.date),
    db.select().from(timeProjects).orderBy(timeProjects.name),
    db
      .select()
      .from(referenceValues)
      .orderBy(
        referenceValues.kind,
        referenceValues.sortOrder,
        referenceValues.label,
      ),
    db.select().from(employmentTypes).orderBy(employmentTypes.sortOrder),
    getDataIntegrityReport(),
    db.select().from(systemSettings).orderBy(systemSettings.key),
  ]);

  return {
    policies,
    types,
    people,
    balances,
    expensePolicies,
    units,
    reporting,
    holidays,
    projects,
    referenceValues: [
      ...dictionaries,
      ...employmentTypeRows.map((item) => ({
        ...item,
        kind: "employment_type",
      })),
    ],
    integrity,
    systemSettings: Object.fromEntries(
      settingsRows.map((row) => {
        try {
          return [row.key, JSON.parse(row.valueJson)];
        } catch {
          return [row.key, null];
        }
      }),
    ),
    year: date.year,
  };
}

export async function getHomeContentAdminData() {
  const db = getDb();
  const [events, announcementsList, polls, deliveries, links] =
    await Promise.all([
      db
        .select()
        .from(companyEvents)
        .orderBy(companyEvents.startsAt)
        .limit(500),
      db
        .select()
        .from(announcements)
        .orderBy(desc(announcements.publishedAt))
        .limit(500),
      db.select().from(announcementPolls).limit(500),
      db.select().from(announcementDeliveries).limit(1_000),
      db.select().from(companyLinks).orderBy(companyLinks.sortOrder).limit(100),
    ]);
  return {
    events,
    announcements: announcementsList.map((announcement) => {
      const poll = polls.find(
        (item) => item.announcementId === announcement.id && item.active,
      );
      return {
        ...announcement,
        body: sanitizeAnnouncementHtml(announcement.body),
        deliveries: deliveries.filter(
          (item) => item.announcementId === announcement.id,
        ),
        poll: poll
          ? {
              id: poll.id,
              title: poll.question,
              description: poll.description,
              questions: parsePollQuestions(
                poll.questionsJson,
                poll.question,
                poll.optionsJson,
              ),
            }
          : null,
      };
    }),
    companyLinks: links,
  };
}
