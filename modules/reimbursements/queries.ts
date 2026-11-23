import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  employees,
  reimbursementPolicies,
  reimbursementRequests,
} from "@/db/schema";
import { getAccessPolicy, type CurrentUser } from "@/lib/auth";
import { canReviewExpense } from "@/modules/reimbursements/access";
import { getDateContext, type DateContext } from "@/modules/shared/date";

export async function getReimbursementOverview(
  employeeId: number,
  user: CurrentUser,
  date: DateContext = getDateContext(),
) {
  const db = getDb();
  const [policy] = await db
    .select()
    .from(reimbursementPolicies)
    .where(eq(reimbursementPolicies.enabled, true))
    .limit(1);
  const requests = await db
    .select()
    .from(reimbursementRequests)
    .where(eq(reimbursementRequests.employeeId, employeeId))
    .orderBy(
      desc(reimbursementRequests.expenseDate),
      desc(reimbursementRequests.id),
    )
    .limit(1_000);
  const access = await getAccessPolicy(user);
  const canViewOrganization = canReviewExpense(user, access, null);
  const canViewDirectReports =
    user.role === "manager" &&
    access.approveExpenses &&
    user.employeeId !== null;
  const pendingBase = () =>
    db
      .select({
        id: reimbursementRequests.id,
        employeeId: reimbursementRequests.employeeId,
        employeeFirstName: employees.firstName,
        employeeLastName: employees.lastName,
        managerId: employees.managerId,
        category: reimbursementRequests.category,
        amountCents: reimbursementRequests.amountCents,
        currency: reimbursementRequests.currency,
        expenseDate: reimbursementRequests.expenseDate,
        description: reimbursementRequests.description,
        receiptUrl: reimbursementRequests.receiptUrl,
        status: reimbursementRequests.status,
      })
      .from(reimbursementRequests)
      .innerJoin(employees, eq(reimbursementRequests.employeeId, employees.id));
  const scope = canViewOrganization
    ? undefined
    : canViewDirectReports
      ? eq(employees.managerId, user.employeeId!)
      : null;
  const pending = scope
    ? await pendingBase()
        .where(and(eq(reimbursementRequests.status, "pending"), scope))
        .orderBy(reimbursementRequests.expenseDate)
        .limit(5_000)
    : canViewOrganization
      ? await pendingBase()
          .where(eq(reimbursementRequests.status, "pending"))
          .orderBy(reimbursementRequests.expenseDate)
          .limit(5_000)
      : [];
  const approvedTotal = requests
    .filter(
      (item) =>
        item.status === "approved" &&
        item.expenseDate.startsWith(`${date.year}-`),
    )
    .reduce((sum, item) => sum + item.amountCents, 0);
  const canViewQuarterly = Boolean(canViewOrganization || canViewDirectReports);
  const quarterlyRows = canViewQuarterly
    ? scope
      ? await pendingBase()
          .where(scope)
          .orderBy(reimbursementRequests.expenseDate)
          .limit(10_000)
      : await pendingBase()
          .orderBy(reimbursementRequests.expenseDate)
          .limit(10_000)
    : [];
  const quarterlyStats = canViewQuarterly
    ? [1, 2, 3, 4].map((quarter) => {
        const rows = quarterlyRows.filter((item) => {
          const month = Number(item.expenseDate.slice(5, 7));
          return (
            item.expenseDate.startsWith(`${date.year}-`) &&
            Math.ceil(month / 3) === quarter
          );
        });
        const countedRows = rows.filter(
          (item) => item.status !== "rejected" && item.status !== "withdrawn",
        );
        return {
          quarter,
          totalCents: countedRows.reduce(
            (sum, item) => sum + item.amountCents,
            0,
          ),
          rows: countedRows,
        };
      })
    : [];

  return {
    policy,
    requests,
    pending,
    approvedTotal,
    year: date.year,
    requestCount: requests.filter(
      (item) =>
        item.expenseDate.startsWith(`${date.year}-`) &&
        item.status !== "rejected" &&
        item.status !== "withdrawn",
    ).length,
    quarterlyStats,
  };
}
