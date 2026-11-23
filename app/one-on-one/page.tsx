import type { Metadata } from "next";
import { OneOnOneWorkspace } from "@/components/one-on-one/OneOnOneWorkspace";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getOneOnOneWorkspace } from "@/modules/one-on-one/queries";
export const metadata: Metadata = { title: "One-on-one" };
export const dynamic = "force-dynamic";
export default async function OneOnOnePage() {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  return (
    <OneOnOneWorkspace
      {...await getOneOnOneWorkspace(user, access)}
      canManageHr={access.managePeople && !user.isPreview}
      readOnlyPreview={user.isPreview === true}
    />
  );
}
