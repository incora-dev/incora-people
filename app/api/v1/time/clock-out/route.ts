import { getApiClientUser } from "@/lib/auth";
import { clientClockOut } from "@/modules/time/client-commands";

export async function POST(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const result = await clientClockOut(clientUser.user, clientUser.clientType);
  if (result.kind === "unlinked")
    return Response.json(
      { error: "Employee account required." },
      { status: 403 },
    );
  if (result.kind === "locked")
    return Response.json(
      { error: "This timesheet period is locked." },
      { status: 409 },
    );
  return Response.json({
    mode: result.kind,
    entry: "entry" in result ? result.entry : null,
  });
}
