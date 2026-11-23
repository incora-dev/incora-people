import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, employees } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { resolveEmployeeReferences } from "@/modules/people/reference-data";
import { z } from "zod";

const optionalUnitId = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().positive().optional(),
);
const schema = z.object({
  managerId: z.preprocess(
    (value) => (value === "" || value === null ? null : value),
    z.coerce.number().int().positive().nullable(),
  ),
  division: z.string().trim().max(100).optional(),
  department: z.string().trim().max(100).optional(),
  team: z.string().trim().max(100).optional(),
  divisionUnitId: optionalUnitId,
  departmentUnitId: optionalUnitId,
  teamUnitId: optionalUnitId,
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings)
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  const { id } = await params;
  const employeeId = Number(id);
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Check the organization and manager details." },
      { status: 400 },
    );
  const managerId = parsed.data.managerId;
  if (managerId === employeeId)
    return Response.json(
      { error: "A person cannot manage themselves." },
      { status: 400 },
    );
  if (managerId) {
    const people = await getDb()
      .select({ id: employees.id, managerId: employees.managerId })
      .from(employees);
    let cursor: number | null = managerId;
    const visited = new Set<number>();
    while (cursor) {
      if (cursor === employeeId)
        return Response.json(
          { error: "This reporting line would create a cycle." },
          { status: 409 },
        );
      if (visited.has(cursor)) break;
      visited.add(cursor);
      cursor = people.find((person) => person.id === cursor)?.managerId ?? null;
    }
  }
  const [manager] = managerId
    ? await getDb()
        .select()
        .from(employees)
        .where(eq(employees.id, managerId))
        .limit(1)
    : [];
  if (managerId && !manager)
    return Response.json({ error: "Manager not found." }, { status: 400 });
  const [currentEmployee] = await getDb()
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!currentEmployee)
    return Response.json({ error: "Employee not found." }, { status: 404 });
  let references;
  try {
    references = await resolveEmployeeReferences({
      division:
        parsed.data.division !== undefined
          ? parsed.data.division
          : currentEmployee.division,
      department:
        parsed.data.department !== undefined
          ? parsed.data.department
          : currentEmployee.department,
      team:
        parsed.data.team !== undefined
          ? parsed.data.team
          : (currentEmployee.team ?? ""),
      divisionUnitId: parsed.data.divisionUnitId,
      departmentUnitId: parsed.data.departmentUnitId,
      teamUnitId: parsed.data.teamUnitId,
      jobTitle: currentEmployee.jobTitle,
      level: currentEmployee.level ?? "",
      employmentType: currentEmployee.employmentType,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid organization reference.",
      },
      { status: 400 },
    );
  }
  const [employee] = await getDb()
    .update(employees)
    .set({
      managerId,
      managerName: manager ? `${manager.firstName} ${manager.lastName}` : null,
      division: references.canonical.division,
      department: references.canonical.department,
      team: references.canonical.team,
      divisionUnitId: references.division.id,
      departmentUnitId: references.department.id,
      teamUnitId: references.team?.id ?? null,
    })
    .where(eq(employees.id, employeeId))
    .returning();
  if (!employee)
    return Response.json({ error: "Employee not found." }, { status: 404 });
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "organization.reporting_updated",
      entityType: "employee",
      entityId: String(employeeId),
      details: `${employee.firstName} ${employee.lastName} reporting line updated`,
    });
  return Response.json({ employee });
}
