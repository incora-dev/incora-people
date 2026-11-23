import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { createTaskSchema } from "@/modules/tasks/contracts";
import { getTaskWorkspaceData } from "@/modules/tasks/queries";
import { parseJsonRequest } from "@/modules/shared/http";
import { createTask, TaskCommandError } from "@/modules/tasks/commands";

export async function GET(request: Request) {
  const client = await getApiClientUser(request);
  if (!client) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const access = await getAccessPolicy(client.user);
  return Response.json(await getTaskWorkspaceData(client.user, access));
}

export async function POST(request: Request) {
  const client = await getApiClientUser(request);
  if (!client) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const user = client.user;
  const access = await getAccessPolicy(user);
  if (!access.managePeople && user.role !== "manager") {
    return Response.json(
      { error: "Manager or HR access required." },
      { status: 403 },
    );
  }

  const parsed = await parseJsonRequest(request, createTaskSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return Response.json(await createTask(user, access, parsed.data), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof TaskCommandError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
