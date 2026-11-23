import { getDb } from "@/db";
import { companyHolidays } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { companyHolidaySchema } from "@/modules/admin/contracts";
import { parseJsonRequest } from "@/modules/shared/http";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.manageSettings) {
    return Response.json(
      { error: "Admin settings access required." },
      { status: 403 },
    );
  }

  const parsed = await parseJsonRequest(request, companyHolidaySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const [holiday] = await getDb()
      .insert(companyHolidays)
      .values(parsed.data)
      .returning();
    return Response.json({ holiday }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return Response.json(
      {
        error: message.includes("UNIQUE")
          ? "A company holiday already exists on this date."
          : "Could not add the company holiday.",
      },
      { status: message.includes("UNIQUE") ? 409 : 500 },
    );
  }
}
