import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { getKnowledgeArticle } from "@/modules/knowledge/queries";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  const { id } = await params;
  const articleId = Number(id);
  if (!Number.isInteger(articleId))
    return Response.json({ error: "Invalid article." }, { status: 400 });
  const access = await getAccessPolicy(client.user);
  const article = await getKnowledgeArticle(
    articleId,
    client.user,
    access.managePeople,
  );
  if (article === undefined)
    return Response.json({ error: "Article not found." }, { status: 404 });
  if (article === null)
    return Response.json({ error: "Article access denied." }, { status: 403 });
  return Response.json({ article });
}
