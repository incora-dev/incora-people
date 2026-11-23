import { getApiClientUser } from "@/lib/auth";
import { getDashboardData } from "@/modules/dashboard/queries";

export async function GET(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  return Response.json(await getDashboardData(clientUser.user));
}
