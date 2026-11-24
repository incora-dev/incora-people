import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { canViewNotInvitedEmployees } from "@/modules/people/directory";
import {
  getEmployeeDirectory,
  getEmployeeProfileRecords,
} from "@/modules/people/queries";

export async function GET(
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
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId))
    return Response.json({ error: "Invalid employee." }, { status: 400 });
  const access = await getAccessPolicy(client.user);
  const employee = (
    await getEmployeeDirectory({
      includeNotInvited:
        canViewNotInvitedEmployees(access) ||
        client.user.employeeId === employeeId,
    })
  ).find((person) => person.id === employeeId);
  if (!employee)
    return Response.json({ error: "Employee not found." }, { status: 404 });
  return Response.json({
    employee,
    records: await getEmployeeProfileRecords(employeeId, false),
  });
}
