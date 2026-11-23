import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { breakEntries, timeEntries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { dateKeyInTimeZone, getDateContext } from "@/modules/shared/date";
import {
  getEmployeeMonthRange,
  getEmployeeTimezone,
} from "@/modules/time/periods";
import {
  netDurationMinutes,
  netDurationMinutesClipped,
} from "@/modules/time/domain";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user.employeeId) {
    return new Response("Account is not linked to an employee.", {
      status: 403,
    });
  }

  const db = getDb();
  const timeZone = await getEmployeeTimezone(user.employeeId);
  const candidate = new URL(request.url).searchParams.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(candidate)
    ? candidate
    : getDateContext(new Date(), timeZone).monthKey;
  const range = await getEmployeeMonthRange(user.employeeId, month);
  const rows = await db
    .select()
    .from(timeEntries)
    .where(
      range
        ? and(
            eq(timeEntries.employeeId, user.employeeId),
            lt(timeEntries.clockIn, range.utcEnd),
            or(
              isNull(timeEntries.clockOut),
              gt(timeEntries.clockOut, range.utcStart),
            ),
          )
        : eq(timeEntries.employeeId, user.employeeId),
    )
    .orderBy(desc(timeEntries.clockIn));
  const breaks = rows.length
    ? await db
        .select({
          timeEntryId: breakEntries.timeEntryId,
          startedAt: breakEntries.startedAt,
          endedAt: breakEntries.endedAt,
        })
        .from(breakEntries)
        .where(
          and(
            inArray(
              breakEntries.timeEntryId,
              rows.map((row) => row.id),
            ),
            ...(range
              ? [
                  lt(breakEntries.startedAt, range.utcEnd),
                  or(
                    isNull(breakEntries.endedAt),
                    gt(breakEntries.endedAt, range.utcStart),
                  ),
                ]
              : []),
          ),
        )
    : [];

  const csv = [
    ["Date", "Clock in", "Clock out", "Worked minutes", "Source", "Note"],
    ...rows.map((row) => [
      dateKeyInTimeZone(row.clockIn, timeZone) ?? row.clockIn.slice(0, 10),
      row.clockIn,
      row.clockOut ?? "",
      row.clockOut
        ? String(
            range
              ? netDurationMinutesClipped(row, breaks, range)
              : netDurationMinutes(row, breaks),
          )
        : "",
      row.source,
      row.note,
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="incora-timesheet-${month}.csv"`,
    },
  });
}
