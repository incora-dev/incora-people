import { and, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { timeCorrections, timeEntries } from "@/db/schema";
import { getApiClientUser } from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";
import { timeCorrectionSchema } from "@/modules/time/contracts";
import { parseTimeInterval } from "@/modules/time/domain";
import {
  getEmployeeMonthKeysForIntervals,
  hasLockedTimesheetPeriods,
  lockedTimesheetResponse,
} from "@/modules/time/periods";

export async function POST(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  if (!client.user.employeeId)
    return Response.json(
      { error: "Employee account required." },
      { status: 403 },
    );
  const parsed = await parseJsonRequest(request, timeCorrectionSchema);
  if (!parsed.ok) return parsed.response;
  const interval = parseTimeInterval(
    parsed.data.requestedClockIn,
    parsed.data.requestedClockOut,
  );
  if (!interval)
    return Response.json(
      { error: "Provide a valid time interval and reason." },
      { status: 400 },
    );
  const startIso = interval.start.toISOString();
  const endIso = interval.end.toISOString();
  const db = getDb();
  const [entry] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.id, parsed.data.timeEntryId),
        eq(timeEntries.employeeId, client.user.employeeId),
      ),
    )
    .limit(1);
  if (!entry)
    return Response.json({ error: "Time entry not found." }, { status: 404 });
  const affectedMonths = await getEmployeeMonthKeysForIntervals(
    client.user.employeeId,
    [
      { start: entry.clockIn, end: entry.clockOut },
      { start: startIso, end: endIso },
    ],
  );
  if (await hasLockedTimesheetPeriods(client.user.employeeId, affectedMonths))
    return lockedTimesheetResponse();
  const [overlap] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.employeeId, client.user.employeeId),
        ne(timeEntries.id, entry.id),
        lt(timeEntries.clockIn, endIso),
        or(isNull(timeEntries.clockOut), gt(timeEntries.clockOut, startIso)),
      ),
    )
    .limit(1);
  if (overlap)
    return Response.json(
      { error: "This correction would overlap another time entry." },
      { status: 409 },
    );
  const monthPlaceholders = affectedMonths.map(() => "?").join(", ");
  const [insertResult] = await getD1().batch([
    getD1()
      .prepare(
        `INSERT INTO time_corrections
           (employee_id, time_entry_id, requested_clock_in,
            requested_clock_out, reason)
         SELECT ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM timesheet_periods
           WHERE employee_id=?
             AND status IN ('locking', 'locked', 'approved')
             AND month IN (${monthPlaceholders})
         )
         RETURNING id`,
      )
      .bind(
        client.user.employeeId,
        entry.id,
        startIso,
        endIso,
        parsed.data.reason,
        client.user.employeeId,
        ...affectedMonths,
      ),
    getD1()
      .prepare(
        `INSERT INTO audit_events(actor_email, action, entity_type, entity_id, details)
         SELECT ?, 'time.correction_requested', 'time_correction', CAST(id AS TEXT), ?
         FROM time_corrections
         WHERE id=last_insert_rowid() AND changes()=1`,
      )
      .bind(client.user.email, `${parsed.data.reason} via mobile`),
  ]);
  if (insertResult.meta.changes !== 1) return lockedTimesheetResponse();
  const insertedId = Number(
    (insertResult.results?.[0] as { id?: number } | undefined)?.id ?? 0,
  );
  const [correction] = await db
    .select()
    .from(timeCorrections)
    .where(eq(timeCorrections.id, insertedId))
    .limit(1);
  if (!correction)
    return Response.json(
      { error: "Correction was not persisted." },
      { status: 500 },
    );
  return Response.json({ correction }, { status: 201 });
}
