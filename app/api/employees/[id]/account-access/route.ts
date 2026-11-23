import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { employees, users } from "@/db/schema";
import {
  getAccessPolicy,
  getCurrentUser,
  hasRecentAuthentication,
  isProtectedSuperAdminUserId,
  recentAuthenticationResponse,
} from "@/lib/auth";
import {
  accountAccessRevocationStatements,
  canManageSystemAccess,
  isSelfAccount,
} from "@/modules/people/identity-policy";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  if (
    !canManageSystemAccess(
      actor.role,
      (await getAccessPolicy(actor)).manageSettings,
    )
  ) {
    return Response.json(
      { error: "Account administrator access required." },
      { status: 403 },
    );
  }
  if (!hasRecentAuthentication(actor)) {
    return recentAuthenticationResponse("/employees");
  }

  const employeeId = Number((await params).id);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return Response.json({ error: "Invalid employee id." }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as {
    enabled?: unknown;
  } | null;
  if (!body || typeof body.enabled !== "boolean") {
    return Response.json(
      { error: "System access must be enabled or disabled explicitly." },
      { status: 400 },
    );
  }

  const db = getDb();
  const [employee] = await db
    .select({ id: employees.id, status: employees.status })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!employee) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }
  const [account] = await db
    .select({ id: users.id, email: users.email, enabled: users.enabled })
    .from(users)
    .where(eq(users.employeeId, employeeId))
    .limit(1);
  if (!account) {
    return Response.json(
      { error: "This employee does not have a system account." },
      { status: 409 },
    );
  }
  if (!body.enabled && isSelfAccount(actor.userId, account.id)) {
    return Response.json(
      { error: "You cannot disable your own system access." },
      { status: 409 },
    );
  }
  if (!body.enabled && (await isProtectedSuperAdminUserId(account.id))) {
    return Response.json(
      { error: "This protected administrator's access cannot be disabled." },
      { status: 409 },
    );
  }
  if (body.enabled && employee.status === "inactive") {
    return Response.json(
      {
        error:
          "Inactive employees cannot be reactivated through generic profile updates.",
      },
      { status: 409 },
    );
  }
  if (account.enabled === body.enabled) {
    return Response.json({ enabled: account.enabled });
  }

  const d1 = getD1();
  const now = new Date().toISOString();
  const statements = [
    d1
      .prepare(
        "UPDATE users SET enabled=?,disabled_at=?,disabled_by_email=? WHERE id=?",
      )
      .bind(
        body.enabled ? 1 : 0,
        body.enabled ? null : now,
        body.enabled ? null : actor.email,
        account.id,
      ),
  ];
  if (!body.enabled) {
    statements.push(
      ...accountAccessRevocationStatements(account.id, now).map(
        ({ sql, values }) => d1.prepare(sql).bind(...values),
      ),
    );
  }
  statements.push(
    d1
      .prepare(
        "INSERT INTO audit_events (actor_email,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)",
      )
      .bind(
        actor.email,
        body.enabled ? "user.access_enabled" : "user.access_disabled",
        "employee",
        String(employeeId),
        body.enabled ? "System access enabled" : "System access disabled",
      ),
  );

  try {
    await d1.batch(statements);
    return Response.json({ enabled: body.enabled });
  } catch {
    return Response.json(
      { error: "Could not update system access." },
      { status: 500 },
    );
  }
}
