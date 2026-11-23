import type { Metadata } from "next";
import { InventoryWorkspace } from "@/components/inventory/InventoryWorkspace";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getOfficeInventory } from "@/modules/inventory/queries";

export const metadata: Metadata = { title: "Office inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const canManage =
    user.role === "super_admin" ||
    (user.role === "hr_admin" && access.manageInventory);
  const readOnlyPreview = user.isPreview === true;
  return (
    <InventoryWorkspace
      initialData={await getOfficeInventory(canManage)}
      canManage={canManage && !readOnlyPreview}
      isSuperAdmin={user.role === "super_admin" && !readOnlyPreview}
      readOnlyPreview={readOnlyPreview}
    />
  );
}
