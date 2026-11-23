import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { employmentTypes, orgUnits, users } from "@/db/schema";
import {
  getAccessPolicy,
  getCurrentUser,
  hasRecentAuthentication,
  recentAuthenticationResponse,
} from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";
import { parseScheduleClockMinutes } from "@/modules/time/contracts";
import { employeeDefaultsSchema } from "@/modules/settings/contracts";

const defaultsSchema = z.object({
  key: z.literal("employee_defaults"),
  value: employeeDefaultsSchema,
});
const adminsSchema = z.object({
  key: z.literal("protected_super_admin_emails"),
  value: z.array(z.email().trim().toLowerCase()).min(1).max(20),
});
const commandSchema = z.discriminatedUnion("key", [
  defaultsSchema,
  adminsSchema,
]);

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (
    user.role !== "super_admin" ||
    !(await getAccessPolicy(user)).manageSettings
  )
    return Response.json(
      { error: "Super administrator access required." },
      { status: 403 },
    );
  if (!hasRecentAuthentication(user))
    return recentAuthenticationResponse("/settings");
  const parsed = await parseJsonRequest(request, commandSchema);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.key === "employee_defaults") {
    const scheduleError = validateScheduleDefaults(parsed.data.value);
    if (scheduleError) {
      return Response.json({ error: scheduleError }, { status: 400 });
    }
    const [division, employmentType] = await Promise.all([
      getDb()
        .select({ id: orgUnits.id })
        .from(orgUnits)
        .where(
          and(
            eq(orgUnits.type, "division"),
            eq(orgUnits.name, parsed.data.value.division),
            eq(orgUnits.active, true),
          ),
        )
        .limit(1),
      getDb()
        .select({ id: employmentTypes.id })
        .from(employmentTypes)
        .where(
          and(
            eq(employmentTypes.label, parsed.data.value.employmentType),
            eq(employmentTypes.active, true),
          ),
        )
        .limit(1),
    ]);
    if (!division.length || !employmentType.length)
      return Response.json(
        {
          error:
            "Choose division and employment type from managed dictionaries.",
        },
        { status: 409 },
      );
  }
  if (parsed.data.key === "protected_super_admin_emails") {
    const emails = [...new Set(parsed.data.value)];
    if (!emails.includes(user.email))
      return Response.json(
        { error: "You cannot remove your own protected access." },
        { status: 409 },
      );
    const accounts = await getDb()
      .select({ email: users.email, role: users.role, enabled: users.enabled })
      .from(users);
    if (
      emails.some(
        (email) =>
          !accounts.some(
            (item) =>
              item.email === email &&
              item.role === "super_admin" &&
              item.enabled,
          ),
      )
    )
      return Response.json(
        {
          error:
            "Every protected address must already be a super administrator.",
        },
        { status: 409 },
      );
    parsed.data.value = emails;
  }
  const now = new Date().toISOString();
  const d1 = getD1();
  await d1.batch([
    d1
      .prepare(
        "INSERT INTO system_settings (key,value_json,updated_by_email,updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_by_email=excluded.updated_by_email,updated_at=excluded.updated_at",
      )
      .bind(
        parsed.data.key,
        JSON.stringify(parsed.data.value),
        user.email,
        now,
      ),
    ...(parsed.data.key === "protected_super_admin_emails"
      ? [
          d1.prepare("DELETE FROM protected_admin_accounts"),
          d1
            .prepare(
              "INSERT INTO protected_admin_accounts (user_id, granted_by_user_id, created_at) SELECT users.id, ?, ? FROM users JOIN json_each(?) configured ON lower(users.email)=lower(configured.value) WHERE users.role='super_admin' AND users.enabled=1",
            )
            .bind(user.userId, now, JSON.stringify(parsed.data.value)),
        ]
      : []),
    d1
      .prepare(
        "INSERT INTO audit_events (actor_email,action,entity_type,entity_id,details) VALUES (?,'system_setting.updated','system_setting',?,?)",
      )
      .bind(user.email, parsed.data.key, parsed.data.key),
  ]);
  return Response.json({ key: parsed.data.key, value: parsed.data.value });
}

function validateScheduleDefaults(value: {
  workDays: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  timezone: string;
}) {
  const days = value.workDays.split(",");
  if (new Set(days).size !== days.length)
    return "Work days must not contain duplicates.";
  const start = parseScheduleClockMinutes(value.startTime);
  const end = parseScheduleClockMinutes(value.endTime);
  if (start === null) return "Start time must be a valid 24-hour time.";
  if (end === null) return "End time must be a valid 24-hour time.";
  if (end <= start) return "End time must be later than start time.";
  if (value.breakMinutes >= end - start)
    return "Break must be shorter than the scheduled work interval.";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timezone });
  } catch {
    return "Enter a valid IANA timezone.";
  }
  return null;
}
