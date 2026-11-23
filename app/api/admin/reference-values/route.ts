import { getDb } from "@/db";
import { auditEvents, referenceValues } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";
import { z } from "zod";

const schema = z.object({
  kind: z.enum(["technology", "level", "position", "legal_entity"]),
  label: z.string().trim().min(1).max(100),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(100),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).managePeople) return forbidden();
  const parsed = await parseJsonRequest(request, schema);
  if (!parsed.ok) return parsed.response;
  const value = parsed.data.label.toLocaleLowerCase("uk-UA");
  try {
    const [item] = await getDb()
      .insert(referenceValues)
      .values({ ...parsed.data, value })
      .returning();
    await getDb()
      .insert(auditEvents)
      .values({
        actorEmail: user.email,
        action: "reference_value.create",
        entityType: "reference_value",
        entityId: String(item.id),
        details: `${item.kind}: ${item.label}`,
      });
    return Response.json({ item }, { status: 201 });
  } catch {
    return Response.json(
      { error: "This value already exists." },
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
