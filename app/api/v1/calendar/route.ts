import { getApiClientUser } from "@/lib/auth";
import { getLeaveCalendar } from "@/modules/leave/queries";

export async function GET(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  return Response.json({ events: await getLeaveCalendar() });
}
