import { getDb } from "@/db";
import { auditEvents, orgUnits } from "@/db/schema";
import { getAccessPolicy, getApiClientUser } from "@/lib/auth";

export async function POST(request: Request) {
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
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = String(body.type);
  if (!name || !["division", "department", "team"].includes(type))
    return Response.json(
      { error: "Enter a name and valid unit type." },
      { status: 400 },
    );
  const [unit] = await getDb()
    .insert(orgUnits)
    .values({
      name,
      type,
      parentId: Number(body.parentId) || null,
      leadEmployeeId: Number(body.leadEmployeeId) || null,
      sortOrder: 100,
    })
    .returning();
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: client.user.email,
      action: "organization.unit_created",
      entityType: "org_unit",
      entityId: String(unit.id),
      details: `${type}: ${name} via mobile`,
    });
  return Response.json({ unit }, { status: 201 });
}
