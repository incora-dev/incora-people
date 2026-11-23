import type { Metadata } from "next";
import { TaskWorkspace } from "@/components/tasks/TaskWorkspace";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getTaskWorkspaceData } from "@/modules/tasks/queries";

export const metadata: Metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const data = await getTaskWorkspaceData(user, access);
  return (
    <TaskWorkspace
      {...data}
      canCreate={data.canCreate && !user.isPreview}
      readOnlyPreview={user.isPreview === true}
    />
  );
}
