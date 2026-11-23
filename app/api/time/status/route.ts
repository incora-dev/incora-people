import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { breakEntries, timeEntries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user.employeeId) return Response.json({ active: false, linked: false });
  const [entry] = await getDb()
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.employeeId, user.employeeId),
        isNull(timeEntries.clockOut),
      ),
    )
    .orderBy(desc(timeEntries.clockIn))
    .limit(1);
  const [openBreak] = entry
    ? await getDb()
        .select()
        .from(breakEntries)
        .where(
          and(
            eq(breakEntries.timeEntryId, entry.id),
            isNull(breakEntries.endedAt),
          ),
        )
        .limit(1)
    : [];
  return Response.json({
    active: Boolean(entry),
    linked: true,
    entry,
    openBreak,
  });
}
