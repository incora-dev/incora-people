import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, companyLinks } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { companyLinkSchema } from "@/modules/admin/contracts";
import { parseJsonRequest } from "@/modules/shared/http";

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
    return Response.json({ error: "Invalid link id." }, { status: 400 });
  const parsed = await parseJsonRequest(request, companyLinkSchema);
  if (!parsed.ok) return parsed.response;
  const [link] = await getDb()
    .update(companyLinks)
    .set(parsed.data)
    .where(eq(companyLinks.id, id))
    .returning();
  if (!link)
    return Response.json({ error: "Link not found." }, { status: 404 });
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "update",
      entityType: "company_link",
      entityId: String(id),
      details: link.label,
    });
  return Response.json({ link });
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
    return Response.json({ error: "Invalid link id." }, { status: 400 });
  const db = getDb();
  await db.delete(companyLinks).where(eq(companyLinks.id, id));
  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: "delete",
    entityType: "company_link",
    entityId: String(id),
  });
  return Response.json({ ok: true });
}
