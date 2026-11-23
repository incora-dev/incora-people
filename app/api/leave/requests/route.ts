import { getCurrentUser } from "@/lib/auth";
import { createLeaveRequest } from "@/modules/leave/commands";
import { createLeaveRequestSchema } from "@/modules/leave/contracts";
import { applicationErrorResponse } from "@/modules/shared/application-error";
import { parseJsonRequest } from "@/modules/shared/http";

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, createLeaveRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const created = await createLeaveRequest(await getCurrentUser(), {
      ...parsed.data,
      idempotencyKey:
        request.headers.get("idempotency-key")?.trim().slice(0, 160) || null,
    });
    return Response.json(
      { request: created },
      { status: created.idempotencyKey ? 200 : 201 },
    );
  } catch (error) {
    return applicationErrorResponse(error);
  }
}
