import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { getKnowledgeArticles } from "@/modules/knowledge/queries";

export async function GET(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const access = await getAccessPolicy(clientUser.user);
  return Response.json({
    articles: await getKnowledgeArticles(clientUser.user, access.managePeople),
  });
}
