import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { createEmployee } from "@/modules/people/commands";
import { createEmployeeSchema } from "@/modules/people/contracts";
import { ApplicationError } from "@/modules/shared/application-error";
import { parseJsonRequest } from "@/modules/shared/http";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.managePeople) {
    return Response.json(
      { error: "HR administrator access required." },
      { status: 403 },
    );
  }

  const parsed = await parseJsonRequest(request, createEmployeeSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const employee = await createEmployee(user, parsed.data);
    return Response.json({ employee }, { status: 201 });
  } catch (error) {
    if (error instanceof ApplicationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return Response.json(
      { error: "Could not create the employee." },
      { status: 500 },
    );
  }
}
