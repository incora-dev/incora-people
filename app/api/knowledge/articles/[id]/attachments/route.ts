import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  attachStoredFile,
  deleteStoredFile,
  storePrivateFile,
  validatePrivateFile,
} from "@/modules/files/storage";
import {
  canManageKnowledgeRole,
  getKnowledgeArticle,
} from "@/modules/knowledge/queries";
import { applicationErrorResponse } from "@/modules/shared/application-error";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.managePeople)
    return Response.json(
      { error: "People administration access required." },
      { status: 403 },
    );
  if (!user.employeeId)
    return Response.json(
      { error: "Employee account required." },
      { status: 400 },
    );
  const { id } = await params;
  if (!Number.isInteger(Number(id)))
    return Response.json({ error: "Invalid article." }, { status: 400 });
  const article = await getKnowledgeArticle(
    Number(id),
    user,
    access.managePeople,
  );
  if (!article)
    return Response.json({ error: "Article not found." }, { status: 404 });
  if (!canManageKnowledgeRole(user, access.managePeople, article.minimumRole)) {
    return Response.json(
      { error: "You cannot change an article above your access level." },
      { status: 403 },
    );
  }
  try {
    const file = validatePrivateFile((await request.formData()).get("file"));
    const stored = await storePrivateFile({
      file,
      kind: "knowledge_attachment",
      category: "knowledge",
      ownerEmployeeId: user.employeeId,
      user,
    });
    try {
      await attachStoredFile(stored.id, "knowledge_article", id);
    } catch (error) {
      await deleteStoredFile(stored.id, user);
      throw error;
    }
    return Response.json(
      {
        attachment: {
          id: stored.id,
          originalName: stored.originalName,
          sizeBytes: stored.sizeBytes,
          contentType: stored.contentType,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return applicationErrorResponse(error);
  }
}
