import { z } from "zod";
import { getAccessPolicy, getCurrentUser, type CurrentUser } from "@/lib/auth";
import { sendEmployeeInvitation } from "@/modules/invitations/commands";
import { getEmployeeInvitationSummary } from "@/modules/invitations/queries";
import { ApplicationError } from "@/modules/shared/application-error";
import { parseJsonRequest } from "@/modules/shared/http";

const sendSchema = z.object({
  attemptId: z.uuid(),
  acknowledgeReminder: z.boolean().default(false),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  const denied = await requireInvitationManagement(actor);
  if (denied) return denied;
  const employeeId = parseEmployeeId((await params).id);
  if (!employeeId) {
    return Response.json({ error: "Invalid employee id." }, { status: 400 });
  }
  const summary = await getEmployeeInvitationSummary(employeeId);
  if (!summary.employeeExists) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }
  return Response.json(summary, {
    headers: { "cache-control": "private, no-store" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentUser();
  const denied = await requireInvitationManagement(actor);
  if (denied) return denied;
  const employeeId = parseEmployeeId((await params).id);
  if (!employeeId) {
    return Response.json({ error: "Invalid employee id." }, { status: 400 });
  }
  const parsed = await parseJsonRequest(request, sendSchema, 4_096);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await sendEmployeeInvitation({
      actor,
      employeeId,
      attemptId: parsed.data.attemptId,
      acknowledgeReminder: parsed.data.acknowledgeReminder,
    });
    const summary = await getEmployeeInvitationSummary(employeeId);
    const error =
      result.status === "failed"
        ? failureMessage(result.failureCode)
        : undefined;
    return Response.json(
      { ...summary, result, error },
      {
        status:
          result.status === "failed"
            ? 502
            : result.status === "sending" || result.status === "uncertain"
              ? 202
              : 200,
        headers: { "cache-control": "private, no-store" },
      },
    );
  } catch (error) {
    if (error instanceof ApplicationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return Response.json(
      { error: "Invitation delivery could not be completed." },
      { status: 500 },
    );
  }
}

async function requireInvitationManagement(actor: CurrentUser) {
  const access = await getAccessPolicy(actor);
  if (actor.isPreview || !actor.userId || !access.managePeople) {
    return Response.json(
      { error: "HR administrator access is required." },
      { status: 403 },
    );
  }
  return null;
}

function parseEmployeeId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function failureMessage(code: string | null) {
  if (code === "provider_authentication") {
    return "Email provider credentials or sender configuration were rejected.";
  }
  if (code === "provider_rate_limit") {
    return "The email provider rate limit was reached. Try again later.";
  }
  return "The email provider rejected the invitation. Check its configuration and retry.";
}
