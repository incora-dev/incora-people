import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KnowledgeSectionView } from "@/components/knowledge/KnowledgeSectionView";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getKnowledgeSection } from "@/modules/knowledge/queries";
import { getEmployeeManagerOptions } from "@/modules/people/queries";

export const metadata: Metadata = { title: "Knowledge section" };
export const dynamic = "force-dynamic";

export default async function KnowledgeSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sectionId = Number(id);
  if (!Number.isInteger(sectionId) || sectionId <= 0) notFound();
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const [section, employeeOptions] = await Promise.all([
    getKnowledgeSection(sectionId, user, access.managePeople),
    access.managePeople ? getEmployeeManagerOptions() : Promise.resolve([]),
  ]);
  if (!section) notFound();
  return (
    <KnowledgeSectionView
      key={`knowledge-section-${section.id}`}
      section={section}
      canManage={access.managePeople}
      employeeOptions={employeeOptions}
    />
  );
}
