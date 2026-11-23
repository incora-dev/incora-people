import { getCurrentUser } from "@/lib/auth";
import { clientClockOut } from "@/modules/time/client-commands";

export async function POST() {
  const user = await getCurrentUser();
  const result = await clientClockOut(user, "web");
  if (result.kind === "unlinked") {
    return Response.json(
      { error: "Your account is not linked to an employee." },
      { status: 403 },
    );
  }
  if (result.kind === "locked") {
    return Response.json(
      { error: "This timesheet period is locked." },
      { status: 409 },
    );
  }
  return Response.json({
    mode: result.kind,
    entry: "entry" in result ? result.entry : null,
  });
}
