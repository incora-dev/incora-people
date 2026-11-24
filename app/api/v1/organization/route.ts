import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { canViewNotInvitedEmployees } from "@/modules/people/directory";
import { getOrgPeople, getOrgUnits } from "@/modules/people/queries";

export async function GET(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  const access = await getAccessPolicy(client.user);
  const [people, units] = await Promise.all([
    getOrgPeople({ includeNotInvited: canViewNotInvitedEmployees(access) }),
    getOrgUnits(),
  ]);
  return Response.json({ people, units });
}
