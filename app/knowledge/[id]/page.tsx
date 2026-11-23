import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KnowledgeArticleView } from "@/components/knowledge/KnowledgeArticleView";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getKnowledgeArticle } from "@/modules/knowledge/queries";
import { getEmployeeManagerOptions } from "@/modules/people/queries";

export const metadata: Metadata = { title: "Guide" };
export const dynamic = "force-dynamic";

export default async function KnowledgeArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const articleId = Number(id);
  if (!Number.isInteger(articleId) || articleId <= 0) notFound();

  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const [article, employeeOptions] = await Promise.all([
    getKnowledgeArticle(articleId, user, access.managePeople),
    access.managePeople ? getEmployeeManagerOptions() : Promise.resolve([]),
  ]);
  if (!article) notFound();

  return (
    <KnowledgeArticleView
      key={`knowledge-article-${article.id}`}
      article={article}
      canManage={access.managePeople}
      employeeOptions={employeeOptions}
    />
  );
}
