import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, employees, orgUnits } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z
    .preprocess(
      (value) => (value === "" || value === null ? null : value),
      z.coerce.number().int().positive().nullable(),
    )
    .optional(),
  leadEmployeeId: z
    .preprocess(
      (value) => (value === "" || value === null ? null : value),
      z.coerce.number().int().positive().nullable(),
    )
    .optional(),
  active: z.boolean().optional(),
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
  const unitId = Number(id);
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Check the organization unit details." },
      { status: 400 },
    );
  const [current] = await getDb()
    .select()
    .from(orgUnits)
    .where(eq(orgUnits.id, unitId))
    .limit(1);
  if (!current)
    return Response.json(
      { error: "Organization unit not found." },
      { status: 404 },
    );
  const name = parsed.data.name ?? current.name;
  const active = parsed.data.active ?? current.active;
  const parentId =
    parsed.data.parentId === undefined
      ? current.parentId
      : parsed.data.parentId;
  const expectedParentType =
    current.type === "department"
      ? "division"
      : current.type === "team"
        ? "department"
        : null;
  if (expectedParentType && current.parentId !== null && parentId === null)
    return Response.json(
      {
        error: `A ${current.type} must remain within a ${expectedParentType}.`,
      },
      { status: 400 },
    );
  if (!expectedParentType && parentId !== null)
    return Response.json(
      { error: "A division cannot have a parent." },
      { status: 400 },
    );
  if (parentId !== null) {
    const [parent] = await getDb()
      .select()
      .from(orgUnits)
      .where(eq(orgUnits.id, parentId))
      .limit(1);
    if (!parent || parent.type !== expectedParentType || !parent.active)
      return Response.json(
        { error: `Choose an active ${expectedParentType} parent.` },
        { status: 400 },
      );
  }
  if (parentId === unitId)
    return Response.json(
      { error: "A unit cannot be its own parent." },
      { status: 400 },
    );
  if (parentId) {
    const units = await getDb()
      .select({ id: orgUnits.id, parentId: orgUnits.parentId })
      .from(orgUnits);
    let cursor: number | null = parentId;
    const visited = new Set<number>();
    while (cursor) {
      if (cursor === unitId)
        return Response.json(
          { error: "This parent would create an organization cycle." },
          { status: 409 },
        );
      if (visited.has(cursor)) break;
      visited.add(cursor);
      cursor = units.find((unit) => unit.id === cursor)?.parentId ?? null;
    }
  }
  if (parentId !== current.parentId && parentId !== null) {
    const affectedEmployee =
      current.type === "department"
        ? (
            await getDb()
              .select({ id: employees.id })
              .from(employees)
              .where(
                and(
                  eq(employees.departmentUnitId, unitId),
                  ne(employees.divisionUnitId, parentId),
                ),
              )
              .limit(1)
          )[0]
        : current.type === "team"
          ? (
              await getDb()
                .select({ id: employees.id })
                .from(employees)
                .where(
                  and(
                    eq(employees.teamUnitId, unitId),
                    ne(employees.departmentUnitId, parentId),
                  ),
                )
                .limit(1)
            )[0]
          : undefined;
    if (affectedEmployee)
      return Response.json(
        { error: "Reassign employees before changing this parent." },
        { status: 409 },
      );
  }
  const referenceColumn =
    current.type === "division"
      ? employees.divisionUnitId
      : current.type === "department"
        ? employees.departmentUnitId
        : current.type === "team"
          ? employees.teamUnitId
          : null;
  if (!active && referenceColumn) {
    const [inUse] = await getDb()
      .select({ id: employees.id })
      .from(employees)
      .where(eq(referenceColumn, unitId))
      .limit(1);
    if (inUse)
      return Response.json(
        { error: "Reassign employees before deactivating this unit." },
        { status: 409 },
      );
  }
  const [unit] = await getDb()
    .update(orgUnits)
    .set({
      name,
      parentId,
      leadEmployeeId:
        parsed.data.leadEmployeeId === undefined
          ? current.leadEmployeeId
          : parsed.data.leadEmployeeId,
      active,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(orgUnits.id, unitId))
    .returning();
  if (name !== current.name && current.type === "department") {
    await getDb()
      .update(employees)
      .set({ department: name })
      .where(eq(employees.departmentUnitId, unitId));
  }
  if (name !== current.name && current.type === "division") {
    await getDb()
      .update(employees)
      .set({ division: name })
      .where(eq(employees.divisionUnitId, unitId));
  }
  if (name !== current.name && current.type === "team") {
    await getDb()
      .update(employees)
      .set({ team: name })
      .where(eq(employees.teamUnitId, unitId));
  }
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "organization.unit_updated",
      entityType: "org_unit",
      entityId: String(unitId),
      details: `${current.name} → ${name}`,
    });
  return Response.json({ unit });
}
