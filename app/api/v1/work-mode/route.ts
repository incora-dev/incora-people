import { getApiClientUser } from "@/lib/auth";
import {
  getEmployeeWorkMode,
  parseWorkMode,
  updateEmployeeWorkMode,
} from "@/modules/work-mode/service";

function errorFor(result: { kind: string }) {
  if (result.kind === "unlinked")
    return Response.json(
      { error: "Employee account required." },
      { status: 403 },
    );
  if (result.kind === "missing")
    return Response.json({ error: "Employee not found." }, { status: 404 });
  return null;
}

export async function GET(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  const result = await getEmployeeWorkMode(client.user);
  return errorFor(result) ?? Response.json(result);
}

export async function PATCH(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  const body = (await request.json().catch(() => ({}))) as {
    mode?: unknown;
    defaultMode?: unknown;
  };
  const mode = parseWorkMode(body.mode);
  const defaultMode = parseWorkMode(body.defaultMode);
  if (!mode && !defaultMode)
    return Response.json(
      { error: "Work mode must be office or remote." },
      { status: 400 },
    );
  const result = await updateEmployeeWorkMode(client.user, {
    mode: mode ?? undefined,
    defaultMode: defaultMode ?? undefined,
  });
  return errorFor(result) ?? Response.json(result);
}
