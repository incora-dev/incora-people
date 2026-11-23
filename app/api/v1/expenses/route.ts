import { getApiClientUser } from "@/lib/auth";
import { getReimbursementOverview } from "@/modules/reimbursements/queries";

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
    await getReimbursementOverview(clientUser.user.employeeId, clientUser.user),
  );
}
