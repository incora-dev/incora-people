import type { Metadata } from "next";
import { asc, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { employees } from "@/db/schema";
import { InventoryWorkspace } from "@/components/inventory/InventoryWorkspace";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getOfficeInventory } from "@/modules/inventory/queries";
import { getOrgUnits } from "@/lib/data";

export const metadata: Metadata = { title: "Office inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const canManage =
    user.role === "super_admin" ||
    (user.role === "hr_admin" && access.manageInventory);
  const readOnlyPreview = user.isPreview === true;
  const showAssetForm = canManage && !readOnlyPreview;
  const [initialData, people, units] = await Promise.all([
    getOfficeInventory(canManage, undefined, canManage && !readOnlyPreview),
    // Holder choices for the item form; only inventory managers receive them.
    canManage && !readOnlyPreview
      ? getDb()
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
          })
          .from(employees)
          .where(ne(employees.status, "inactive"))
          .orderBy(asc(employees.firstName), asc(employees.lastName))
      : Promise.resolve([]),
    showAssetForm ? getOrgUnits() : Promise.resolve([]),
  ]);
  const unitNames = (type: string) =>
    [
      ...new Set(
        units.filter((unit) => unit.type === type).map((unit) => unit.name),
      ),
    ].sort((a, b) => a.localeCompare(b));
  return (
    <InventoryWorkspace
      initialData={initialData}
      canManage={canManage && !readOnlyPreview}
      isSuperAdmin={user.role === "super_admin" && !readOnlyPreview}
      readOnlyPreview={readOnlyPreview}
      people={people}
      orgUnits={{
        divisions: unitNames("division"),
        departments: unitNames("department"),
      }}
    />
  );
}
