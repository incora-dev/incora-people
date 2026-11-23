import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, companyEvents } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { companyEventSchema } from "@/modules/admin/contracts";
import { parseJsonRequest } from "@/modules/shared/http";
import { normalizeDateTime } from "@/modules/shared/date";
import { getWorkspaceTimezone } from "@/modules/settings/system";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings)
    return Response.json(
      { error: "Admin settings access required." },
      { status: 403 },
    );
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json({ error: "Invalid event id." }, { status: 400 });
  const parsed = await parseJsonRequest(request, companyEventSchema);
  if (!parsed.ok) return parsed.response;
  const timeZone = await getWorkspaceTimezone();
  const startsAt = normalizeDateTime(parsed.data.startsAt, timeZone);
  const endsAt = parsed.data.endsAt
    ? normalizeDateTime(parsed.data.endsAt, timeZone)
    : null;
  if (!startsAt || (parsed.data.endsAt && !endsAt)) {
    return Response.json({ error: "Invalid event date." }, { status: 400 });
  }
  if (endsAt && endsAt <= startsAt) {
    return Response.json(
      { error: "Event end must be after its start." },
      { status: 400 },
    );
  }
  const [event] = await getDb()
    .update(companyEvents)
    .set({
      ...parsed.data,
      startsAt,
      endsAt,
      url: parsed.data.url || null,
    })
    .where(eq(companyEvents.id, id))
    .returning();
  if (!event)
    return Response.json({ error: "Event not found." }, { status: 404 });
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "update",
      entityType: "company_event",
      entityId: String(id),
      details: event.title,
    });
  return Response.json({ event });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings) {
    return Response.json(
      { error: "Admin settings access required." },
      { status: 403 },
    );
  }
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json({ error: "Invalid event id." }, { status: 400 });
  const db = getDb();
  await db.delete(companyEvents).where(eq(companyEvents.id, id));
  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: "delete",
    entityType: "company_event",
    entityId: String(id),
  });
  return Response.json({ ok: true });
}
