import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents,
  knowledgeArticles,
  knowledgeSections,
  storedFiles,
} from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  createKnowledgeArticleSchema,
  updateKnowledgeArticleSchema,
} from "@/modules/knowledge/contracts";
import { canManageKnowledgeRole } from "@/modules/knowledge/queries";
import { deleteStoredFile } from "@/modules/files/storage";
import { parseJsonRequest } from "@/modules/shared/http";
import { sanitizeKnowledgeHtml } from "@/modules/knowledge/content";
import {
  replaceKnowledgeArticleAccess,
  validateKnowledgeRecipients,
} from "@/modules/knowledge/access";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.managePeople)
    return Response.json(
      { error: "People administration access required." },
      { status: 403 },
    );
  const parsed = await parseJsonRequest(request, createKnowledgeArticleSchema);
  if (!parsed.ok) return parsed.response;
  if (
    !canManageKnowledgeRole(user, access.managePeople, parsed.data.minimumRole)
  )
    return Response.json(
      { error: "You cannot create an article above your own access level." },
      { status: 403 },
    );
  const { sharedEmployeeIds, ...articleData } = parsed.data;
  const recipients = await validateKnowledgeRecipients(sharedEmployeeIds);
  if (recipients === null)
    return Response.json(
      { error: "One or more selected employees do not exist." },
      { status: 400 },
    );
  const [section] = await getDb()
    .select()
    .from(knowledgeSections)
    .where(eq(knowledgeSections.id, parsed.data.sectionId))
    .limit(1);
  if (!section)
    return Response.json(
      { error: "Knowledge section not found." },
      { status: 404 },
    );
  if (!canManageKnowledgeRole(user, access.managePeople, section.minimumRole))
    return Response.json(
      { error: "You cannot add content to this section." },
      { status: 403 },
    );
  const [article] = await getDb()
    .insert(knowledgeArticles)
    .values({
      ...articleData,
      body: sanitizeKnowledgeHtml(articleData.body),
      category: section.title,
      authorEmail: user.email,
    })
    .returning();
  await replaceKnowledgeArticleAccess(article.id, recipients, user.email);
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "knowledge.article_created",
      entityType: "knowledge_article",
      entityId: String(article.id),
      details: article.title,
    });
  return Response.json(
    { article: { ...article, sharedEmployeeIds: recipients } },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.managePeople)
    return Response.json(
      { error: "People administration access required." },
      { status: 403 },
    );
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id))
    return Response.json({ error: "Invalid article." }, { status: 400 });
  const [existing] = await getDb()
    .select({ minimumRole: knowledgeArticles.minimumRole })
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .limit(1);
  if (!existing)
    return Response.json({ error: "Article not found." }, { status: 404 });
  if (!canManageKnowledgeRole(user, access.managePeople, existing.minimumRole))
    return Response.json(
      { error: "You cannot delete an article above your own access level." },
      { status: 403 },
    );
  const db = getDb();
  const attachments = await db
    .select({ id: storedFiles.id })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.kind, "knowledge_attachment"),
        eq(storedFiles.relatedEntityType, "knowledge_article"),
        eq(storedFiles.relatedEntityId, String(id)),
      ),
    );
  await Promise.all(attachments.map((file) => deleteStoredFile(file.id, user)));
  const [article] = await db
    .delete(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .returning();
  if (!article)
    return Response.json({ error: "Article not found." }, { status: 404 });
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "knowledge.article_deleted",
      entityType: "knowledge_article",
      entityId: String(id),
      details: article.title,
    });
  return Response.json({ deleted: true });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.managePeople)
    return Response.json(
      { error: "People administration access required." },
      { status: 403 },
    );
  const parsed = await parseJsonRequest(request, updateKnowledgeArticleSchema);
  if (!parsed.ok) return parsed.response;
  if (
    !canManageKnowledgeRole(user, access.managePeople, parsed.data.minimumRole)
  )
    return Response.json(
      { error: "You cannot set an article above your own access level." },
      { status: 403 },
    );
  const { id, sharedEmployeeIds, ...data } = parsed.data;
  const recipients = await validateKnowledgeRecipients(sharedEmployeeIds);
  if (recipients === null)
    return Response.json(
      { error: "One or more selected employees do not exist." },
      { status: 400 },
    );
  const [section] = await getDb()
    .select()
    .from(knowledgeSections)
    .where(eq(knowledgeSections.id, data.sectionId))
    .limit(1);
  if (!section)
    return Response.json(
      { error: "Knowledge section not found." },
      { status: 404 },
    );
  if (!canManageKnowledgeRole(user, access.managePeople, section.minimumRole))
    return Response.json(
      { error: "You cannot move content to this section." },
      { status: 403 },
    );
  const [existing] = await getDb()
    .select({ minimumRole: knowledgeArticles.minimumRole })
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .limit(1);
  if (!existing)
    return Response.json({ error: "Article not found." }, { status: 404 });
  if (!canManageKnowledgeRole(user, access.managePeople, existing.minimumRole))
    return Response.json(
      { error: "You cannot edit an article above your own access level." },
      { status: 403 },
    );
  const [article] = await getDb()
    .update(knowledgeArticles)
    .set({
      ...data,
      body: sanitizeKnowledgeHtml(data.body),
      category: section.title,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(knowledgeArticles.id, id))
    .returning();
  if (!article)
    return Response.json({ error: "Article not found." }, { status: 404 });
  await replaceKnowledgeArticleAccess(id, recipients, user.email);
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "knowledge.article_updated",
      entityType: "knowledge_article",
      entityId: String(id),
      details: article.title,
    });
  return Response.json({
    article: { ...article, sharedEmployeeIds: recipients },
  });
}
