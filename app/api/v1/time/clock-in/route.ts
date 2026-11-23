import { z } from "zod";
import { getApiClientUser } from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";
import { clientClockIn } from "@/modules/time/client-commands";

const clockInSchema = z
  .object({
    workMode: z.enum(["office", "remote"]).default("office"),
    projectId: z.coerce.number().int().positive().nullable().optional(),
    timeCode: z
      .enum(["project", "internal", "learning", "admin"])
      .default("project"),
  })
  .strict();

export async function POST(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const parsed = await parseJsonRequest(request, clockInSchema);
  if (!parsed.ok) return parsed.response;
  const result = await clientClockIn(clientUser.user, {
    projectId: parsed.data.projectId ?? null,
    timeCode: parsed.data.timeCode,
    workMode: parsed.data.workMode,
    source: clientUser.clientType,
  });
  if (result.kind === "unlinked")
    return Response.json(
      { error: "Employee account required." },
      { status: 403 },
    );
  if (result.kind === "inactive")
    return Response.json(
      { error: "Inactive employees cannot start a timer." },
      { status: 403 },
    );
  if (result.kind === "locked")
    return Response.json(
      { error: "This timesheet period is locked." },
      { status: 409 },
    );
  if (result.kind === "invalid_project")
    return Response.json(
      { error: "Selected project is not active." },
      { status: 400 },
    );
  if (result.kind === "conflict")
    return Response.json(
      { error: "Timer state changed. Refresh status and try again." },
      { status: 409 },
    );
  return Response.json(
    { mode: result.kind, entry: result.entry },
    { status: result.kind === "started" ? 201 : 200 },
  );
}
