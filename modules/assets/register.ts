import { asc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { companyAssets, employees } from "@/db/schema";
import type { AccessPolicy, CurrentUser } from "@/lib/auth";
import { assetEmploymentCycle } from "@/modules/assets/filter-options";
import { getEmployeeLifecycleStage } from "@/modules/people/directory";
import { getDateContext } from "@/modules/shared/date";

export type AssetAttribute = { label: string; value: string };

export type AssetRegisterItem = {
  id: number;
  name: string;
  assetTag: string;
  category: string;
  status: string;
  serialNumber: string;
  price: string;
  location: string;
  division: string;
  department: string;
  warrantyEnds: string | null;
  description: string;
  repairHistory: string;
  attributes: AssetAttribute[];
  assignee: {
    id: number | null;
    firstName: string;
    lastName: string;
    jobTitle: string;
    assignedSince: string | null;
    cycle: ReturnType<typeof assetEmploymentCycle>;
  } | null;
};

export function parseAssetAttributes(json: string): AssetAttribute[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is AssetAttribute =>
        typeof item?.label === "string" && typeof item?.value === "string",
    );
  } catch {
    return [];
  }
}

function splitName(fullName: string) {
  const [firstName = "", ...rest] = fullName.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

/**
 * Company asset register for the /company-assets page. Visibility follows the
 * /assets workspace: people administrators see every asset, managers see their
 * own and their reports' assets, everyone else only their own. Purchase and
 * service details are returned to people administrators only.
 */
export async function getAssetRegister(
  user: CurrentUser,
  access: AccessPolicy,
): Promise<AssetRegisterItem[]> {
  const canManage = access.managePeople;
  const scope = canManage
    ? undefined
    : user.role === "manager"
      ? or(
          eq(companyAssets.assignedEmployeeId, user.employeeId ?? -1),
          eq(employees.managerId, user.employeeId ?? -1),
        )
      : eq(companyAssets.assignedEmployeeId, user.employeeId ?? -1);
  const { today } = getDateContext();
  const rows = await getDb()
    .select({
      id: companyAssets.id,
      name: companyAssets.name,
      assetTag: companyAssets.assetTag,
      category: companyAssets.category,
      status: companyAssets.status,
      serialNumber: companyAssets.serialNumber,
      price: companyAssets.price,
      location: companyAssets.location,
      division: companyAssets.division,
      department: companyAssets.department,
      warrantyEnds: companyAssets.warrantyEnds,
      description: companyAssets.description,
      repairHistory: companyAssets.repairHistory,
      attributesJson: companyAssets.attributesJson,
      assignedSince: companyAssets.assignedSince,
      assigneeName: companyAssets.assigneeName,
      assigneeId: employees.id,
      assigneeFirstName: employees.firstName,
      assigneeLastName: employees.lastName,
      assigneeJobTitle: employees.jobTitle,
      assigneeStatus: employees.status,
      assigneeProbationEnd: employees.probationEnd,
    })
    .from(companyAssets)
    .leftJoin(employees, eq(companyAssets.assignedEmployeeId, employees.id))
    .where(scope)
    .orderBy(asc(companyAssets.assetTag));

  return rows.map((row) => {
    const assignee =
      row.assigneeId !== null
        ? {
            id: row.assigneeId,
            firstName: row.assigneeFirstName ?? "",
            lastName: row.assigneeLastName ?? "",
            jobTitle: row.assigneeJobTitle ?? "",
            assignedSince: row.assignedSince,
            cycle: assetEmploymentCycle(
              getEmployeeLifecycleStage(
                row.assigneeStatus ?? "active",
                row.assigneeProbationEnd,
                today,
              ),
            ),
          }
        : row.assigneeName
          ? {
              id: null,
              ...splitName(row.assigneeName),
              jobTitle: "",
              assignedSince: row.assignedSince,
              cycle: "working" as const,
            }
          : null;
    return {
      id: row.id,
      name: row.name,
      assetTag: row.assetTag,
      category: row.category,
      status: row.status,
      serialNumber: canManage ? row.serialNumber : "",
      price: canManage ? row.price : "",
      location: row.location,
      division: row.division,
      department: row.department,
      warrantyEnds: row.warrantyEnds,
      description: canManage ? row.description : "",
      repairHistory: canManage ? row.repairHistory : "",
      attributes: parseAssetAttributes(row.attributesJson),
      assignee,
    };
  });
}
