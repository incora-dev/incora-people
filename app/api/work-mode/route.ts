import { getCurrentUser } from "@/lib/auth";
import {
  getEmployeeWorkMode,
  parseWorkMode,
  updateEmployeeWorkMode,
} from "@/modules/work-mode/service";

function response(result: Awaited<ReturnType<typeof getEmployeeWorkMode>>) {
  if (result.kind === "unlinked")
    return Response.json(
      { error: "Employee account required." },
      { status: 409 },
    );
  if (result.kind === "missing")
    return Response.json({ error: "Employee not found." }, { status: 404 });
  return Response.json(result);
}

export async function GET() {
  return response(await getEmployeeWorkMode(await getCurrentUser()));
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    mode?: unknown;
    defaultMode?: unknown;
  };
  const mode = body.mode === undefined ? undefined : parseWorkMode(body.mode);
  const defaultMode =
    body.defaultMode === undefined
      ? undefined
      : parseWorkMode(body.defaultMode);
  if (
    (body.mode !== undefined && !mode) ||
    (body.defaultMode !== undefined && !defaultMode) ||
    (!mode && !defaultMode)
  ) {
    return Response.json(
      { error: "Work mode must be office or remote." },
      { status: 400 },
    );
  }
  const result = await updateEmployeeWorkMode(await getCurrentUser(), {
    mode: mode ?? undefined,
    defaultMode: defaultMode ?? undefined,
  });
  if (result.kind === "unlinked")
    return Response.json(
      { error: "Employee account required." },
      { status: 409 },
    );
  if (result.kind === "missing")
    return Response.json({ error: "Employee not found." }, { status: 404 });
  return Response.json(result);
}
