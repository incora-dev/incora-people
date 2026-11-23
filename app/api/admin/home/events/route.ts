import { getDb } from "@/db";
import { auditEvents, companyEvents } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { companyEventSchema } from "@/modules/admin/contracts";
import { parseJsonRequest } from "@/modules/shared/http";
import { normalizeDateTime } from "@/modules/shared/date";
import { getWorkspaceTimezone } from "@/modules/settings/system";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings) {
    return Response.json(
      { error: "Admin settings access required." },
      { status: 403 },
    );
  }
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
  const db = getDb();
  const [event] = await db
    .insert(companyEvents)
    .values({
      ...parsed.data,
      startsAt,
      endsAt,
      url: parsed.data.url || null,
      createdByEmail: user.email,
    })
    .returning();
  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: "create",
    entityType: "company_event",
    entityId: String(event.id),
    details: event.title,
  });
  return Response.json({ event }, { status: 201 });
}
