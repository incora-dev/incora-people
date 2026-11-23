import { getApiClientUser } from "@/lib/auth";
import { getActiveTimeProjects, getTimeOverview } from "@/modules/time/queries";

export async function GET(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  if (!client.user.employeeId)
    return Response.json(
      { error: "Employee account required." },
      { status: 403 },
    );
  const [overview, projects] = await Promise.all([
    getTimeOverview(client.user.employeeId),
    getActiveTimeProjects(),
  ]);
  return Response.json({ ...overview, projects });
}
