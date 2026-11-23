import { getDb } from "@/db";
import { auditEvents, companyLinks } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { companyLinkSchema } from "@/modules/admin/contracts";
import { parseJsonRequest } from "@/modules/shared/http";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings) {
    return Response.json(
      { error: "Admin settings access required." },
      { status: 403 },
    );
  }
  const parsed = await parseJsonRequest(request, companyLinkSchema);
  if (!parsed.ok) return parsed.response;
  const db = getDb();
  const [link] = await db
    .insert(companyLinks)
    .values({ ...parsed.data, createdByEmail: user.email })
    .returning();
  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: "create",
    entityType: "company_link",
    entityId: String(link.id),
    details: link.label,
  });
  return Response.json({ link }, { status: 201 });
}
