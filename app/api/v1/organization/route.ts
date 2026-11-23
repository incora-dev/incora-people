import { getApiClientUser } from "@/lib/auth";
import { getOrgPeople, getOrgUnits } from "@/modules/people/queries";

export async function GET(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  const [people, units] = await Promise.all([getOrgPeople(), getOrgUnits()]);
  return Response.json({ people, units });
}
