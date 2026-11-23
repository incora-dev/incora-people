import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents,
  employeePrivateDetails,
  employeeProfileRecords,
  employees,
  referenceValues,
} from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";
import { z } from "zod";

const schema = z.object({
  label: z.string().trim().min(1).max(100),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(10000),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).managePeople) return forbidden();
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json({ error: "Invalid value id." }, { status: 400 });
  const parsed = await parseJsonRequest(request, schema);
  if (!parsed.ok) return parsed.response;
  const [current] = await getDb()
    .select()
    .from(referenceValues)
    .where(eq(referenceValues.id, id))
    .limit(1);
  if (!current)
    return Response.json({ error: "Value not found." }, { status: 404 });
  const employeeReference =
    current.kind === "position"
      ? employees.positionValueId
      : current.kind === "level"
        ? employees.levelValueId
        : null;
  if (!parsed.data.active && employeeReference) {
    const [inUse] = await getDb()
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employeeReference, id))
      .limit(1);
    if (inUse)
      return Response.json(
        { error: "Reassign employees before deactivating this value." },
        { status: 409 },
      );
  }
  if (!parsed.data.active && current.kind === "technology") {
    const [inUse] = await getDb()
      .select({ id: employeeProfileRecords.id })
      .from(employeeProfileRecords)
      .where(eq(employeeProfileRecords.referenceValueId, id))
      .limit(1);
    if (inUse)
      return Response.json(
        { error: "Remove this technology from employee profiles first." },
        { status: 409 },
      );
  }
  if (!parsed.data.active && current.kind === "legal_entity") {
    const [inUse] = await getDb()
      .select({ employeeId: employeePrivateDetails.employeeId })
      .from(employeePrivateDetails)
      .where(eq(employeePrivateDetails.legalEntityValueId, id))
      .limit(1);
    if (inUse)
      return Response.json(
        { error: "Reassign employees before deactivating this legal entity." },
        { status: 409 },
      );
  }
  const [item] = await getDb()
    .update(referenceValues)
    .set({
      ...parsed.data,
      value: parsed.data.label.toLocaleLowerCase("uk-UA"),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(referenceValues.id, id))
    .returning();
  if (!item)
    return Response.json({ error: "Value not found." }, { status: 404 });
  if (item.kind === "position")
    await getDb()
      .update(employees)
      .set({ jobTitle: item.label })
      .where(eq(employees.positionValueId, item.id));
  if (item.kind === "level")
    await getDb()
      .update(employees)
      .set({ level: item.label })
      .where(eq(employees.levelValueId, item.id));
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "reference_value.update",
      entityType: "reference_value",
      entityId: String(item.id),
      details: `${item.kind}: ${item.label}`,
    });
  return Response.json({ item });
}

function forbidden() {
  return Response.json(
    { error: "People administration access required." },
    { status: 403 },
  );
}
