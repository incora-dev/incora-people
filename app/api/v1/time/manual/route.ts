import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { timeEntries, timeProjects } from "@/db/schema";
import { getApiClientUser } from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";
import { manualTimeEntrySchema } from "@/modules/time/contracts";
import { parseTimeInterval } from "@/modules/time/domain";
import {
  getEmployeeMonthKeysForIntervals,
  hasLockedTimesheetPeriods,
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
  const parsed = await parseJsonRequest(request, manualTimeEntrySchema);
  if (!parsed.ok) return parsed.response;
  const interval = parseTimeInterval(parsed.data.clockIn, parsed.data.clockOut);
  if (!interval)
    return Response.json(
      { error: "Enter a valid work interval under 24 hours." },
      { status: 400 },
    );
  const startIso = interval.start.toISOString();
  const endIso = interval.end.toISOString();
  const affectedMonths = await getEmployeeMonthKeysForIntervals(
    client.user.employeeId,
    [{ start: startIso, end: endIso }],
  );
  if (await hasLockedTimesheetPeriods(client.user.employeeId, affectedMonths))
    return Response.json(
      { error: "This timesheet period is locked." },
      { status: 409 },
    );
  const db = getDb();
  const idempotencyKey =
    request.headers.get("idempotency-key")?.trim().slice(0, 160) || null;
  const commandKey = idempotencyKey ?? crypto.randomUUID();
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.employeeId, client.user.employeeId),
          eq(timeEntries.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return Response.json({ entry: existing, replayed: true });
  }
  if (parsed.data.projectId) {
    const [project] = await db
      .select({ id: timeProjects.id })
      .from(timeProjects)
      .where(
        and(
          eq(timeProjects.id, parsed.data.projectId),
          eq(timeProjects.active, true),
        ),
      )
      .limit(1);
    if (!project)
      return Response.json(
        { error: "Selected project is not active." },
        { status: 400 },
      );
  }
  const [overlap] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.employeeId, client.user.employeeId),
        lt(timeEntries.clockIn, endIso),
        or(isNull(timeEntries.clockOut), gt(timeEntries.clockOut, startIso)),
      ),
    )
    .limit(1);
  if (overlap)
    return Response.json(
      { error: "This interval overlaps an existing entry." },
      { status: 409 },
    );
  let entry;
  try {
    const d1 = getD1();
    const monthPlaceholders = affectedMonths.map(() => "?").join(", ");
    const results = await d1.batch([
      d1
        .prepare(
          `INSERT INTO time_entries
             (employee_id, clock_in, clock_out, source, note, project_id,
              time_code, work_mode, idempotency_key)
           SELECT ?, ?, ?, 'mobile', ?, ?, ?, ?, ?
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
          startIso,
          endIso,
          parsed.data.note,
          parsed.data.projectId ?? null,
          parsed.data.timeCode,
          parsed.data.workMode,
          commandKey,
          client.user.employeeId,
          ...affectedMonths,
        ),
      d1
        .prepare(
          `INSERT INTO audit_events
             (actor_email, action, entity_type, entity_id, details)
           SELECT ?, 'time.manual_entry_created', 'time_entry', CAST(id AS TEXT), ?
           FROM time_entries
           WHERE employee_id=? AND idempotency_key=?
           LIMIT 1`,
        )
        .bind(
          client.user.email,
          `${startIso}–${endIso} via mobile`,
          client.user.employeeId,
          commandKey,
        ),
    ]);
    const entryId = Number(
      (results[0]?.results?.[0] as { id?: number } | undefined)?.id ?? 0,
    );
    if (!entryId) {
      if (
        await hasLockedTimesheetPeriods(client.user.employeeId, affectedMonths)
      )
        return Response.json(
          { error: "This timesheet period is locked." },
          { status: 409 },
        );
      return Response.json(
        { error: "Time entry state changed. Refresh and retry." },
        { status: 409 },
      );
    }
    [entry] = await db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.id, entryId))
      .limit(1);
    if (!entry) throw new Error("Time entry was not persisted.");
  } catch (error) {
    if (String(error).includes("time_entry_overlap")) {
      return Response.json(
        { error: "This interval overlaps an existing entry." },
        { status: 409 },
      );
    }
    if (idempotencyKey && String(error).includes("UNIQUE")) {
      const [existing] = await db
        .select()
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.employeeId, client.user.employeeId),
            eq(timeEntries.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) return Response.json({ entry: existing, replayed: true });
    }
    throw error;
  }
  return Response.json(
    { entry: { ...entry, idempotencyKey } },
    { status: idempotencyKey ? 200 : 201 },
  );
}
