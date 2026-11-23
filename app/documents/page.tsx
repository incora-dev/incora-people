import type { Metadata } from "next";
import { DocumentWorkspace } from "@/components/documents/DocumentWorkspace";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getCompanyDocuments } from "@/modules/documents/queries";
export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";
export default async function DocumentsPage() {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  return (
    <DocumentWorkspace
      {...await getCompanyDocuments()}
      canManage={access.managePeople && !user.isPreview}
      readOnlyPreview={user.isPreview === true}
    />
  );
}
