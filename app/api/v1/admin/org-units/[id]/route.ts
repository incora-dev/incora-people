import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, employees, orgUnits } from "@/db/schema";
import { getAccessPolicy, getApiClientUser } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  if (!(await getAccessPolicy(client.user)).manageSettings)
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  const unitId = Number((await params).id);
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
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
  const name = typeof body.name === "string" ? body.name.trim() : current.name;
  const parentId =
    body.parentId === undefined
      ? current.parentId
      : Number(body.parentId) || null;
  if (!name || parentId === unitId)
    return Response.json(
      { error: "Enter a valid name and parent." },
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
  const active =
    body.active === undefined ? current.active : Boolean(body.active);
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
        body.leadEmployeeId === undefined
          ? current.leadEmployeeId
          : Number(body.leadEmployeeId) || null,
      active,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(orgUnits.id, unitId))
    .returning();
  if (name !== current.name) {
    const column =
      current.type === "department"
        ? employees.departmentUnitId
        : current.type === "division"
          ? employees.divisionUnitId
          : employees.teamUnitId;
    await getDb()
      .update(employees)
      .set({
        [current.type === "department"
          ? "department"
          : current.type === "division"
            ? "division"
            : "team"]: name,
      })
      .where(eq(column, unitId));
  }
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: client.user.email,
      action: "organization.unit_updated",
      entityType: "org_unit",
      entityId: String(unitId),
      details: `${current.name} → ${name} via mobile`,
    });
  return Response.json({ unit });
}
