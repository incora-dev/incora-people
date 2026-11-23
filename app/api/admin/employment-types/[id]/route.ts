import { eq } from "drizzle-orm";
import { z } from "zod";
import { getD1, getDb } from "@/db";
import { employees, employmentTypes } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";

const schema = z.object({
  label: z.string().trim().min(1).max(100),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(10000),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).managePeople) return forbidden();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: "Invalid employment type id." },
      { status: 400 },
    );
  const parsed = await parseJsonRequest(request, schema);
  if (!parsed.ok) return parsed.response;
  const [current] = await getDb()
    .select()
    .from(employmentTypes)
    .where(eq(employmentTypes.id, id))
    .limit(1);
  if (!current)
    return Response.json({ error: "Value not found." }, { status: 404 });
  if (!parsed.data.active) {
    const [inUse] = await getDb()
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.employmentTypeId, id))
      .limit(1);
    if (inUse)
      return Response.json(
        { error: "Reassign employees before deactivating this value." },
        { status: 409 },
      );
  }
  const value = parsed.data.label.toLocaleLowerCase("uk-UA");
  const now = new Date().toISOString();
  const d1 = getD1();
  try {
    await d1.batch([
      d1
        .prepare(
          "UPDATE employment_types SET value=?,label=?,active=?,sort_order=?,updated_at=? WHERE id=?",
        )
        .bind(
          value,
          parsed.data.label,
          parsed.data.active ? 1 : 0,
          parsed.data.sortOrder,
          now,
          id,
        ),
      d1
        .prepare(
          "INSERT INTO audit_events(actor_email,action,entity_type,entity_id,details) VALUES(?,'employment_type.update','employment_type',?,?)",
        )
        .bind(
          user.email,
          String(id),
          `${current.label} → ${parsed.data.label}`,
        ),
    ]);
    const [row] = await getDb()
      .select()
      .from(employmentTypes)
      .where(eq(employmentTypes.id, id))
      .limit(1);
    return Response.json({ item: { ...row, kind: "employment_type" } });
  } catch {
    return Response.json(
      { error: "This value already exists or is in use." },
      { status: 409 },
    );
  }
}

function forbidden() {
  return Response.json(
    { error: "People administration access required." },
    { status: 403 },
  );
}
