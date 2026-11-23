import type { Metadata } from "next";
import { AssetWorkspace } from "@/components/assets/AssetWorkspace";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getAssetsWorkspaceData } from "@/modules/assets/queries";
export const metadata: Metadata = { title: "Assets" };
export const dynamic = "force-dynamic";
export default async function AssetsPage() {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const data = await getAssetsWorkspaceData(user, access);
  return (
    <AssetWorkspace
      {...data}
      canManage={access.managePeople && !user.isPreview}
    />
  );
}
