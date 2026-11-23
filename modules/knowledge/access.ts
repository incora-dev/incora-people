import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { employees, knowledgeArticleAccess } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { hasMinimumRole } from "@/lib/roles";

export async function getKnowledgeArticleAccess(articleIds: number[]) {
  const accessByArticle = new Map<number, number[]>();
  if (articleIds.length === 0) return accessByArticle;

  const rows = await getDb()
    .select({
      articleId: knowledgeArticleAccess.articleId,
      employeeId: knowledgeArticleAccess.employeeId,
    })
    .from(knowledgeArticleAccess)
    .where(inArray(knowledgeArticleAccess.articleId, articleIds));
  for (const row of rows) {
    const current = accessByArticle.get(row.articleId) ?? [];
    current.push(row.employeeId);
    accessByArticle.set(row.articleId, current);
  }
  return accessByArticle;
}

export async function validateKnowledgeRecipients(employeeIds: number[]) {
  const uniqueIds = [...new Set(employeeIds)];
  if (uniqueIds.length === 0) return uniqueIds;
  const rows = await getDb()
    .select({ id: employees.id })
    .from(employees)
    .where(inArray(employees.id, uniqueIds));
  if (rows.length !== uniqueIds.length) return null;
  return uniqueIds;
}

export async function replaceKnowledgeArticleAccess(
  articleId: number,
  employeeIds: number[],
  grantedByEmail: string,
) {
  const db = getDb();
  await db
    .delete(knowledgeArticleAccess)
    .where(eq(knowledgeArticleAccess.articleId, articleId));
  if (employeeIds.length === 0) return;
  await db.insert(knowledgeArticleAccess).values(
    employeeIds.map((employeeId) => ({
      articleId,
      employeeId,
      grantedByEmail,
    })),
  );
}

export function canReadKnowledgeArticle(
  article: { minimumRole: string; authorEmail: string },
  user: Pick<CurrentUser, "email" | "employeeId" | "role">,
  sharedEmployeeIds: number[],
) {
  return (
    user.email === article.authorEmail ||
    (user.employeeId !== null && sharedEmployeeIds.includes(user.employeeId)) ||
    hasMinimumRole(user.role, article.minimumRole)
  );
}
