import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, orgUnits } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["division", "department", "team"]),
  parentId: z.preprocess(
    (value) => (value === "" || value === null ? null : value),
    z.coerce.number().int().positive().nullable(),
  ),
  leadEmployeeId: z
    .preprocess(
      (value) => (value === "" || value === null ? null : value),
      z.coerce.number().int().positive().nullable(),
    )
    .optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(100),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings)
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Enter a name and valid unit type." },
      { status: 400 },
    );
  const expectedParentType =
    parsed.data.type === "department"
      ? "division"
      : parsed.data.type === "team"
        ? "department"
        : null;
  if (!expectedParentType && parsed.data.parentId !== null)
    return Response.json(
      { error: "A division cannot have a parent." },
      { status: 400 },
    );
  if (expectedParentType) {
    const [parent] = await getDb()
      .select()
      .from(orgUnits)
      .where(eq(orgUnits.id, parsed.data.parentId ?? -1))
      .limit(1);
    if (!parent || parent.type !== expectedParentType || !parent.active)
      return Response.json(
        { error: `Choose an active ${expectedParentType} parent.` },
        { status: 400 },
      );
  }
  const [unit] = await getDb()
    .insert(orgUnits)
    .values({
      ...parsed.data,
      leadEmployeeId: parsed.data.leadEmployeeId ?? null,
    })
    .returning();
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "organization.unit_created",
      entityType: "org_unit",
      entityId: String(unit.id),
      details: `${unit.type}: ${unit.name}`,
    });
  return Response.json({ unit }, { status: 201 });
}
