import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, knowledgeArticles, knowledgeSections } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  createKnowledgeSectionSchema,
  updateKnowledgeSectionSchema,
} from "@/modules/knowledge/contracts";
import { canManageKnowledgeRole } from "@/modules/knowledge/queries";
import { parseJsonRequest } from "@/modules/shared/http";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const parsed = await parseJsonRequest(request, createKnowledgeSectionSchema);
  if (!parsed.ok) return parsed.response;
  if (
    !canManageKnowledgeRole(user, access.managePeople, parsed.data.minimumRole)
  ) {
    return Response.json(
      { error: "People administration access required." },
      { status: 403 },
    );
  }

  try {
    const [section] = await getDb()
      .insert(knowledgeSections)
      .values({ ...parsed.data, createdByEmail: user.email })
      .returning();
    await getDb()
      .insert(auditEvents)
      .values({
        actorEmail: user.email,
        action: "knowledge.section_created",
        entityType: "knowledge_section",
        entityId: String(section.id),
        details: section.title,
      });
    return Response.json({ section }, { status: 201 });
  } catch {
    return Response.json(
      { error: "A section with this title already exists." },
      { status: 409 },
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const parsed = await parseJsonRequest(request, updateKnowledgeSectionSchema);
  if (!parsed.ok) return parsed.response;
  const { id, ...data } = parsed.data;
  const [existing] = await getDb()
    .select()
    .from(knowledgeSections)
    .where(eq(knowledgeSections.id, id))
    .limit(1);
  if (!existing)
    return Response.json(
      { error: "Knowledge section not found." },
      { status: 404 },
    );
  if (
    !canManageKnowledgeRole(user, access.managePeople, existing.minimumRole) ||
    !canManageKnowledgeRole(user, access.managePeople, data.minimumRole)
  ) {
    return Response.json(
      { error: "People administration access required." },
      { status: 403 },
    );
  }

  try {
    const [section] = await getDb()
      .update(knowledgeSections)
      .set(data)
      .where(eq(knowledgeSections.id, id))
      .returning();
    await getDb()
      .update(knowledgeArticles)
      .set({ category: section.title })
      .where(eq(knowledgeArticles.sectionId, id));
    await getDb()
      .insert(auditEvents)
      .values({
        actorEmail: user.email,
        action: "knowledge.section_updated",
        entityType: "knowledge_section",
        entityId: String(id),
        details: section.title,
      });
    return Response.json({ section });
  } catch {
    return Response.json(
      { error: "A section with this title already exists." },
      { status: 409 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json(
      { error: "Invalid knowledge section." },
      { status: 400 },
    );
  }
  const [section] = await getDb()
    .select()
    .from(knowledgeSections)
    .where(eq(knowledgeSections.id, id))
    .limit(1);
  if (!section)
    return Response.json(
      { error: "Knowledge section not found." },
      { status: 404 },
    );
  if (!canManageKnowledgeRole(user, access.managePeople, section.minimumRole)) {
    return Response.json(
      { error: "People administration access required." },
      { status: 403 },
    );
  }
  const [article] = await getDb()
    .select({ id: knowledgeArticles.id })
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.sectionId, id))
    .limit(1);
  if (article) {
    return Response.json(
      { error: "Move or delete the articles before deleting this section." },
      { status: 409 },
    );
  }
  await getDb().delete(knowledgeSections).where(eq(knowledgeSections.id, id));
  await getDb()
    .insert(auditEvents)
    .values({
      actorEmail: user.email,
      action: "knowledge.section_deleted",
      entityType: "knowledge_section",
      entityId: String(id),
      details: section.title,
    });
  return Response.json({ deleted: true });
}
