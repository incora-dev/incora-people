import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { getAdminSettingsData } from "@/modules/admin/queries";
import { getBugReports } from "@/modules/bugs/queries";

export async function GET(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  const access = await getAccessPolicy(client.user);
  if (!access.manageSettings)
    return Response.json(
      { error: "Settings administrator access required." },
      { status: 403 },
    );
  const [settings, reports] = await Promise.all([
    getAdminSettingsData(),
    getBugReports(),
  ]);
  return Response.json({ settings, reports });
}
