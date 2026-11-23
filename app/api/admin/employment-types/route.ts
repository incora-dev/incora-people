import { z } from "zod";
import { eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { employmentTypes } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";

const schema = z.object({
  label: z.string().trim().min(1).max(100),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(100),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).managePeople) return forbidden();
  const parsed = await parseJsonRequest(request, schema);
  if (!parsed.ok) return parsed.response;
  const value = parsed.data.label.toLocaleLowerCase("uk-UA");
  const d1 = getD1();
  try {
    await d1.batch([
      d1
        .prepare(
          "INSERT INTO employment_types(value,label,sort_order) VALUES(?,?,?)",
        )
        .bind(value, parsed.data.label, parsed.data.sortOrder),
      d1
        .prepare(
          "INSERT INTO audit_events(actor_email,action,entity_type,entity_id,details) VALUES(?,'employment_type.create','employment_type',?,?)",
        )
        .bind(user.email, value, parsed.data.label),
    ]);
    const [row] = await getDb()
      .select()
      .from(employmentTypes)
      .where(eq(employmentTypes.value, value))
      .limit(1);
    return Response.json(
      { item: { ...row, kind: "employment_type" } },
      { status: 201 },
    );
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
