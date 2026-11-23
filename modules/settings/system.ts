import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { systemSettings } from "@/db/schema";
import {
  employeeDefaultsSchema,
  type EmployeeDefaults,
} from "@/modules/settings/contracts";

export type { EmployeeDefaults };

export async function getEmployeeDefaults(): Promise<EmployeeDefaults> {
  const value = await getSystemSetting<unknown>("employee_defaults");
  const parsed = employeeDefaultsSchema.safeParse(value);
  if (!parsed.success)
    throw new Error("Required system setting employee_defaults is invalid.");
  return parsed.data;
}

export async function getWorkspaceTimezone() {
  return (await getEmployeeDefaults()).timezone;
}

export async function getProtectedSuperAdminEmails() {
  const configured = await getSystemSetting<string[]>(
    "protected_super_admin_emails",
  );
  return Array.isArray(configured)
    ? configured.map((email) => email.trim().toLowerCase()).filter(Boolean)
    : [];
}

async function getSystemSetting<T>(key: string): Promise<T | null | undefined> {
  try {
    const [row] = await getDb()
      .select({ valueJson: systemSettings.valueJson })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    return row ? (JSON.parse(row.valueJson) as T) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no such table")) return undefined;
    throw error;
  }
}
