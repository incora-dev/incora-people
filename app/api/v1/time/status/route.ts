import { getApiClientUser } from "@/lib/auth";
import { getClientTimeStatus } from "@/modules/time/client-commands";

export async function GET(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  return Response.json(await getClientTimeStatus(clientUser.user));
}
