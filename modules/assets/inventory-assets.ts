import { getD1 } from "@/db";
import type { AccessPolicy, CurrentUser } from "@/lib/auth";
import { assetEmploymentCycle } from "@/modules/assets/filter-options";
import type { AssetRegisterItem } from "@/modules/assets/register";
import { canManageInventory } from "@/modules/inventory/domain";
import { parseInventoryAttributes } from "@/modules/inventory/queries";
import { getEmployeeLifecycleStage } from "@/modules/people/directory";
import { getDateContext } from "@/modules/shared/date";

/**
 * Inventory groups shown on the company assets page, mapped to asset
 * categories. Items of the write-off group are listed as archived.
 */
export const INVENTORY_ASSET_GROUPS = {
  Ноутбук: "laptop",
  Монітор: "monitor",
  Списано: "written_off",
} as const;

type InventoryAssetRow = {
  id: number;
  sku: string;
  name: string;
  description: string;
  groupName: keyof typeof INVENTORY_ASSET_GROUPS;
  locations: string | null;
  serialNumber: string;
  price: string;
  division: string;
  department: string;
  warrantyEnds: string | null;
  repairHistory: string;
  attributesJson: string;
  assignedSince: string | null;
  assigneeName: string;
  employeeId: number | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  employeeStatus: string | null;
  probationEnd: string | null;
};

function splitName(fullName: string) {
  const [firstName = "", ...rest] = fullName.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

/**
 * Company assets read from the office inventory catalog — the same records as
 * /inventory, limited to laptops, monitors and written-off equipment. Every
 * signed-in user sees the catalog, as on /inventory. Serial numbers, prices,
 * repair history and other people's holders are returned only to inventory
 * managers; everyone else sees a holder only on the assets they hold.
 */
export async function getInventoryAssets(
  user: CurrentUser,
  access: AccessPolicy,
): Promise<AssetRegisterItem[]> {
  const canManage =
    canManageInventory(user.role, access.manageInventory) && !user.isPreview;
  const groups = Object.keys(INVENTORY_ASSET_GROUPS);
  const result = await getD1()
    .prepare(
      `SELECT item.id, item.sku, item.name, item.description,
        grp.name AS groupName,
        (SELECT group_concat(name, ', ') FROM (
          SELECT DISTINCT location.name
          FROM inventory_item_stocks stock
          JOIN inventory_storage_locations location ON location.id = stock.location_id
          WHERE stock.item_id = item.id
          ORDER BY location.name)) AS locations,
        item.serial_number AS serialNumber, item.price, item.division,
        item.department, item.warranty_ends AS warrantyEnds,
        item.repair_history AS repairHistory, item.attributes_json AS attributesJson,
        item.assigned_since AS assignedSince, item.assignee_name AS assigneeName,
        employee.id AS employeeId, employee.first_name AS firstName,
        employee.last_name AS lastName, employee.job_title AS jobTitle,
        employee.status AS employeeStatus, employee.probation_end AS probationEnd
      FROM inventory_items item
      JOIN inventory_groups grp ON grp.id = item.group_id
      LEFT JOIN employees employee ON employee.id = item.assigned_employee_id
      WHERE item.active = 1 AND grp.name IN (${groups.map(() => "?").join(", ")})
      ORDER BY item.sku`,
    )
    .bind(...groups)
    .all<InventoryAssetRow>();
  const { today } = getDateContext();

  return (result.results ?? []).map((row) => {
    const category = INVENTORY_ASSET_GROUPS[row.groupName];
    const ownAsset =
      row.employeeId !== null && row.employeeId === user.employeeId;
    const showHolder = canManage || ownAsset;
    const assignee =
      showHolder && row.employeeId !== null
        ? {
            id: row.employeeId,
            firstName: row.firstName ?? "",
            lastName: row.lastName ?? "",
            jobTitle: row.jobTitle ?? "",
            assignedSince: row.assignedSince,
            cycle: assetEmploymentCycle(
              getEmployeeLifecycleStage(
                row.employeeStatus ?? "active",
                row.probationEnd,
                today,
              ),
            ),
          }
        : showHolder && row.assigneeName
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
      assetTag: row.sku,
      category,
      status:
        category === "written_off"
          ? "retired"
          : row.employeeId !== null || row.assigneeName
            ? "assigned"
            : "available",
      serialNumber: canManage ? row.serialNumber : "",
      price: canManage ? row.price : "",
      location: row.locations ?? "",
      division: row.division,
      department: row.department,
      warrantyEnds: row.warrantyEnds,
      description: row.description,
      repairHistory: canManage ? row.repairHistory : "",
      attributes: parseInventoryAttributes(row.attributesJson),
      // Non-managers only learn who holds their own assets.
      assignmentTracked: canManage,
      assignee,
    };
  });
}
