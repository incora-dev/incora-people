import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getDataIntegrityReport } from "@/modules/admin/integrity";

export async function GET() {
  const user = await getCurrentUser();
  if (!(await getAccessPolicy(user)).manageSettings)
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  return Response.json(await getDataIntegrityReport(), {
    headers: { "cache-control": "private, no-store" },
  });
}
