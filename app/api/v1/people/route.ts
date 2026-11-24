import { getAccessPolicy, getApiClientUser } from "@/lib/auth";
import { canViewNotInvitedEmployees } from "@/modules/people/directory";
import { getEmployeeDirectory } from "@/modules/people/queries";

export async function GET(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser) {
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  }

  const query = new URL(request.url).searchParams.get("q")?.trim();
  const normalized = query?.toLocaleLowerCase("uk-UA") ?? "";
  const access = await getAccessPolicy(clientUser.user);
  const people = await getEmployeeDirectory({
    includeNotInvited: canViewNotInvitedEmployees(access),
  });
  const visible = normalized
    ? people.filter((person) =>
        [
          person.firstName,
          person.lastName,
          person.email,
          person.jobTitle,
          person.department,
          person.team ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase("uk-UA")
          .includes(normalized),
      )
    : people;

  return Response.json({ people: visible.slice(0, 100) });
}
