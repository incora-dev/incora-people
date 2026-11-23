import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, employees, workModeEntries } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { getDateContext } from "@/modules/shared/date";

export type WorkMode = "office" | "remote";

export function parseWorkMode(value: unknown): WorkMode | null {
  return value === "office" || value === "remote" ? value : null;
}

export async function getEmployeeWorkMode(user: CurrentUser) {
  if (!user.employeeId) return { kind: "unlinked" as const };
  const db = getDb();
  const { today } = getDateContext();
  const [[employee], [entry]] = await Promise.all([
    db
      .select({ defaultMode: employees.defaultWorkMode })
      .from(employees)
      .where(eq(employees.id, user.employeeId))
      .limit(1),
    db
      .select({ mode: workModeEntries.mode })
      .from(workModeEntries)
      .where(
        and(
          eq(workModeEntries.employeeId, user.employeeId),
          eq(workModeEntries.workDate, today),
        ),
      )
      .limit(1),
  ]);
  if (!employee) return { kind: "missing" as const };
  const defaultMode = parseWorkMode(employee.defaultMode) ?? "office";
  return {
    kind: "ok" as const,
    mode: parseWorkMode(entry?.mode) ?? defaultMode,
    defaultMode,
    workDate: today,
  };
}

export async function updateEmployeeWorkMode(
  user: CurrentUser,
  input: { mode?: WorkMode; defaultMode?: WorkMode },
) {
  if (!user.employeeId) return { kind: "unlinked" as const };
  const current = await getEmployeeWorkMode(user);
  if (current.kind !== "ok") return current;
  const db = getDb();
  const now = new Date().toISOString();
  const requestedMode = input.mode;
  const requestedDefaultMode = input.defaultMode;
  if (requestedDefaultMode !== undefined) {
    await db
      .update(employees)
      .set({ defaultWorkMode: requestedDefaultMode })
      .where(eq(employees.id, user.employeeId));
  }
  if (requestedMode !== undefined) {
    await db
      .insert(workModeEntries)
      .values({
        employeeId: user.employeeId,
        workDate: current.workDate,
        mode: requestedMode,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [workModeEntries.employeeId, workModeEntries.workDate],
        set: { mode: requestedMode, updatedAt: now },
      });
  }
  const mode = requestedMode ?? requestedDefaultMode ?? current.mode;
  const defaultMode = requestedDefaultMode ?? current.defaultMode;
  await db.insert(auditEvents).values({
    actorEmail: user.email,
    action: requestedDefaultMode
      ? "work_mode.default_updated"
      : "work_mode.updated",
    entityType: "employee",
    entityId: String(user.employeeId),
    details: requestedDefaultMode
      ? `Default work mode changed to ${defaultMode}`
      : `Today's work mode changed to ${mode}`,
  });
  return { kind: "ok" as const, mode, defaultMode, workDate: current.workDate };
}
