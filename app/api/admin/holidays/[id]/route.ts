import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyHolidays } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.manageSettings) {
    return Response.json(
      { error: "Admin settings access required." },
      { status: 403 },
    );
  }

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Invalid holiday id." }, { status: 400 });
  }
  await getDb().delete(companyHolidays).where(eq(companyHolidays.id, id));
  return Response.json({ ok: true });
}
