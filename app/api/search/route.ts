import { and, like, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { employees } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  canViewInactiveEmployees,
  canViewNotInvitedEmployees,
} from "@/modules/people/directory";
import { employeeInvitedCondition } from "@/modules/people/active";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] });

  const access = await getAccessPolicy(user);
  const term = `%${query}%`;
  const results = await getDb()
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      jobTitle: employees.jobTitle,
      department: employees.department,
    })
    .from(employees)
    .where(
      and(
        canViewInactiveEmployees(user.role)
          ? undefined
          : ne(employees.status, "inactive"),
        canViewNotInvitedEmployees(access)
          ? undefined
          : employeeInvitedCondition(),
        or(
          like(employees.firstName, term),
          like(employees.lastName, term),
          like(employees.email, term),
          like(employees.jobTitle, term),
        ),
      ),
    )
    .limit(8);

  return Response.json({ results });
}
