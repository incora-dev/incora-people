import { getCurrentUser } from "@/lib/auth";
import { terminateEmployeeSchema } from "@/modules/people/contracts";
import { terminateEmployee } from "@/modules/people/lifecycle";
import { applicationErrorResponse } from "@/modules/shared/application-error";
import { parseJsonRequest } from "@/modules/shared/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = await parseJsonRequest(request, terminateEmployeeSchema);
  if (!parsed.ok) return parsed.response;
  const employeeId = Number((await params).id);
  if (!Number.isInteger(employeeId) || employeeId <= 0)
    return Response.json({ error: "Invalid employee id." }, { status: 400 });
  try {
    return Response.json(
      {
        termination: await terminateEmployee(
          await getCurrentUser(),
          employeeId,
          parsed.data,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return applicationErrorResponse(error);
  }
}
