import { getApiClientUser } from "@/lib/auth";
import { createLeaveRequest } from "@/modules/leave/commands";
import { createLeaveRequestSchema } from "@/modules/leave/contracts";
import { getLeaveOverview } from "@/modules/leave/queries";
import { applicationErrorResponse } from "@/modules/shared/application-error";
import { parseJsonRequest } from "@/modules/shared/http";

export async function GET(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  if (!clientUser.user.employeeId) {
    return Response.json(
      { error: "Employee account required." },
      { status: 403 },
    );
  }
  return Response.json(
    await getLeaveOverview(clientUser.user.employeeId, clientUser.user),
  );
}

export async function POST(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }
  const parsed = await parseJsonRequest(request, createLeaveRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const requestRow = await createLeaveRequest(clientUser.user, {
      ...parsed.data,
      idempotencyKey:
        request.headers.get("idempotency-key")?.trim().slice(0, 160) || null,
    });
    return Response.json(
      { request: requestRow },
      { status: requestRow.idempotencyKey ? 200 : 201 },
    );
  } catch (error) {
    return applicationErrorResponse(error);
  }
}
