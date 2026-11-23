import { getCurrentUser } from "@/lib/auth";
import {
  isTimesheetLocked,
  lockedTimesheetResponse,
} from "@/modules/time/periods";
import { timeToggleSchema } from "@/modules/time/contracts";
import { parseJsonRequest } from "@/modules/shared/http";
import {
  clientClockIn,
  clientClockOut,
  getClientTimeStatus,
} from "@/modules/time/client-commands";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const employeeId = user.employeeId;
  if (!employeeId) {
    return Response.json(
      { error: "Your account is not linked to an employee." },
      { status: 403 },
    );
  }

  const current = await getClientTimeStatus(user);
  if (current.entry) {
    if (await isTimesheetLocked(employeeId, current.entry.clockIn))
      return lockedTimesheetResponse();
    const result = await clientClockOut(user, "web");
    if (result.kind === "stopped")
      return Response.json({ mode: "clock_out", entry: result.entry });
    return Response.json(
      {
        error: "This timer was already stopped. Refreshing its status is safe.",
      },
      { status: 409 },
    );
  }

  const parsed = await parseJsonRequest(request, timeToggleSchema);
  if (!parsed.ok) return parsed.response;
  const result = await clientClockIn(user, {
    projectId: parsed.data.projectId ?? null,
    timeCode: parsed.data.timeCode,
    workMode: parsed.data.workMode,
    source: "web",
  });
  if (result.kind === "started")
    return Response.json(
      { mode: "clock_in", entry: result.entry },
      { status: 201 },
    );
  if (result.kind === "already_running")
    return Response.json({ mode: "already_running", entry: result.entry });
  if (result.kind === "invalid_project")
    return Response.json(
      { error: "Selected project is not active." },
      { status: 400 },
    );
  if (result.kind === "locked") return lockedTimesheetResponse();
  return Response.json(
    { error: "A timer is already running for this employee." },
    { status: 409 },
  );
}
