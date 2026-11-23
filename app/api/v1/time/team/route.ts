import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { getDateContext } from "@/modules/shared/date";
import {
  getPendingCorrections,
  getTeamTimesheets,
} from "@/modules/time/queries";

export async function GET(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  if (!(await getAccessPolicy(client.user)).approveTime)
    return Response.json(
      { error: "Time approval access required." },
      { status: 403 },
    );
  const requested = new URL(request.url).searchParams.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
    ? requested
    : getDateContext().monthKey;
  const [rows, corrections] = await Promise.all([
    getTeamTimesheets(client.user, month),
    getPendingCorrections(client.user),
  ]);
  return Response.json({ month, rows, corrections });
}
