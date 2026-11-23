import { getApiClientUser } from "@/lib/auth";
import { reviewLeaveRequestSchema } from "@/modules/leave/contracts";
import {
  ApprovalError,
  reviewLeaveForClient,
} from "@/modules/approvals/client-reviews";
import { parseJsonRequest } from "@/modules/shared/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId))
    return Response.json({ error: "Invalid leave action." }, { status: 400 });
  const parsed = await parseJsonRequest(request, reviewLeaveRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return Response.json({
      request: await reviewLeaveForClient(client.user, requestId, parsed.data),
    });
  } catch (error) {
    if (error instanceof ApprovalError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
