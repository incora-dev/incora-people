import type { Metadata } from "next";
import { KnowledgeWorkspace } from "@/components/knowledge/KnowledgeWorkspace";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  getKnowledgeArticles,
  getKnowledgeSections,
} from "@/modules/knowledge/queries";
export const metadata: Metadata = { title: "Knowledge base" };
export const dynamic = "force-dynamic";
export default async function KnowledgePage() {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const [articles, sections] = await Promise.all([
    getKnowledgeArticles(user, access.managePeople),
    getKnowledgeSections(user, access.managePeople),
  ]);
  return (
    <KnowledgeWorkspace
      sections={sections}
      articles={articles}
      canManage={access.managePeople}
    />
  );
}
