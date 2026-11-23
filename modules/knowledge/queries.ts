import { and, asc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { knowledgeArticles, knowledgeSections, storedFiles } from "@/db/schema";
import type { CurrentUser, Role } from "@/lib/auth";
import { hasMinimumRole, ROLE_ORDER } from "@/lib/roles";
import { sanitizeKnowledgeHtml } from "@/modules/knowledge/content";
import {
  canReadKnowledgeArticle,
  getKnowledgeArticleAccess,
} from "@/modules/knowledge/access";

export async function getKnowledgeArticles(
  user: CurrentUser,
  canManage: boolean,
) {
  const db = getDb();
  const articles = await db
    .select()
    .from(knowledgeArticles)
    .where(
      canManage
        ? undefined
        : or(
            eq(knowledgeArticles.published, true),
            eq(knowledgeArticles.authorEmail, user.email),
          ),
    )
    .orderBy(asc(knowledgeArticles.category), asc(knowledgeArticles.title));
  const accessByArticle = await getKnowledgeArticleAccess(
    articles.map((article) => article.id),
  );
  const visibleArticles = articles.filter((article) =>
    canReadKnowledgeArticle(
      article,
      user,
      accessByArticle.get(article.id) ?? [],
    ),
  );
  const articleIds = visibleArticles.map((article) => String(article.id));
  const attachments = articleIds.length
    ? await db
        .select({
          id: storedFiles.id,
          relatedEntityId: storedFiles.relatedEntityId,
          originalName: storedFiles.originalName,
          sizeBytes: storedFiles.sizeBytes,
          contentType: storedFiles.contentType,
        })
        .from(storedFiles)
        .where(
          and(
            eq(storedFiles.kind, "knowledge_attachment"),
            eq(storedFiles.relatedEntityType, "knowledge_article"),
            inArray(storedFiles.relatedEntityId, articleIds),
          ),
        )
    : [];
  return visibleArticles.map((article) => ({
    ...article,
    body: sanitizeKnowledgeHtml(article.body),
    sharedEmployeeIds: canManage ? (accessByArticle.get(article.id) ?? []) : [],
    attachments: attachments.filter(
      (file) => file.relatedEntityId === String(article.id),
    ),
  }));
}

export async function getKnowledgeSections(
  user: CurrentUser,
  canManage: boolean,
) {
  const [sections, articles] = await Promise.all([
    getDb()
      .select()
      .from(knowledgeSections)
      .orderBy(asc(knowledgeSections.sortOrder), asc(knowledgeSections.title)),
    getKnowledgeArticles(user, canManage),
  ]);

  const visibleSections = sections
    .filter((section) => canReadKnowledgeRole(section.minimumRole, user.role))
    .map((section) => {
      const children = sections.filter(
        (item) =>
          item.parentId === section.id &&
          canReadKnowledgeRole(item.minimumRole, user.role),
      );
      const relevantIds = [section.id, ...children.map((item) => item.id)];
      const sectionArticles = articles.filter(
        (article) =>
          article.sectionId !== null && relevantIds.includes(article.sectionId),
      );
      return {
        ...section,
        articleCount: sectionArticles.length,
        previewSections: children
          .slice(0, 4)
          .map((item) => ({ id: item.id, title: item.title })),
        previewArticles: sectionArticles.slice(0, 3).map((article) => ({
          id: article.id,
          title: article.title,
        })),
      };
    });
  return visibleSections
    .filter((section) => section.parentId === null)
    .filter((section) => canManage || section.articleCount > 0);
}

export async function getKnowledgeSection(
  id: number,
  user: CurrentUser,
  canManage: boolean,
) {
  const [section] = await getDb()
    .select()
    .from(knowledgeSections)
    .where(eq(knowledgeSections.id, id))
    .limit(1);
  if (!section || !canReadKnowledgeRole(section.minimumRole, user.role)) {
    return null;
  }
  const allArticles = await getKnowledgeArticles(user, canManage);
  const articles = allArticles.filter((article) => article.sectionId === id);
  const childSections = (
    await getDb()
      .select()
      .from(knowledgeSections)
      .orderBy(asc(knowledgeSections.sortOrder), asc(knowledgeSections.title))
  )
    .filter(
      (item) =>
        item.parentId === id &&
        canReadKnowledgeRole(item.minimumRole, user.role),
    )
    .map((item) => ({
      ...item,
      articleCount: allArticles.filter(
        (article) => article.sectionId === item.id,
      ).length,
      previewArticles: allArticles
        .filter((article) => article.sectionId === item.id)
        .slice(0, 3)
        .map((article) => ({ id: article.id, title: article.title })),
    }))
    .filter((item) => canManage || item.articleCount > 0);
  return { ...section, articles, childSections };
}

export async function getKnowledgeArticle(
  id: number,
  user: CurrentUser,
  canManage: boolean,
) {
  const [article] = await getDb()
    .select()
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .limit(1);
  if (!article) return undefined;
  const accessByArticle = await getKnowledgeArticleAccess([article.id]);
  const sharedEmployeeIds = accessByArticle.get(article.id) ?? [];
  const hasArticleAccess = canReadKnowledgeArticle(
    article,
    user,
    sharedEmployeeIds,
  );
  if (
    (!article.published && !canManage && article.authorEmail !== user.email) ||
    (!canManage && !hasArticleAccess)
  ) {
    return null;
  }

  if (article.sectionId) {
    const [section] = await getDb()
      .select({ minimumRole: knowledgeSections.minimumRole })
      .from(knowledgeSections)
      .where(eq(knowledgeSections.id, article.sectionId))
      .limit(1);
    if (
      !section ||
      (!canReadKnowledgeRole(section.minimumRole, user.role) &&
        !hasArticleAccess)
    ) {
      return null;
    }
  }

  const attachments = await getDb()
    .select({
      id: storedFiles.id,
      originalName: storedFiles.originalName,
      sizeBytes: storedFiles.sizeBytes,
      contentType: storedFiles.contentType,
    })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.kind, "knowledge_attachment"),
        eq(storedFiles.relatedEntityType, "knowledge_article"),
        eq(storedFiles.relatedEntityId, String(article.id)),
      ),
    );

  return {
    ...article,
    body: sanitizeKnowledgeHtml(article.body),
    sharedEmployeeIds: canManage ? sharedEmployeeIds : [],
    attachments,
  };
}

export function canReadKnowledgeRole(minimumRole: string, role: Role) {
  return hasMinimumRole(role, minimumRole);
}

export function canManageKnowledgeRole(
  user: CurrentUser,
  canManage: boolean,
  minimumRole: string,
) {
  return (
    canManage &&
    ROLE_ORDER.includes(minimumRole as Role) &&
    hasMinimumRole(user.role, minimumRole)
  );
}
