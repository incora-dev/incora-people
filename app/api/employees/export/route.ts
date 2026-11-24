import { getCurrentUser, hasOrganizationScope } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { getEmployeeDirectory } from "@/modules/people/queries";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!hasOrganizationScope(user)) {
    return Response.json({ error: "HR access required." }, { status: 403 });
  }

  const requestedId = new URL(request.url).searchParams.get("employeeId");
  const employeeId = requestedId ? Number(requestedId) : null;
  if (requestedId && (!Number.isInteger(employeeId) || employeeId! <= 0)) {
    return Response.json({ error: "Invalid employee ID." }, { status: 400 });
  }

  const directory = await getEmployeeDirectory({
    includeInactive: true,
    includeNotInvited: true,
  });
  const employees = employeeId
    ? directory.filter((employee) => employee.id === employeeId)
    : directory;
  if (employeeId && employees.length === 0) {
    return Response.json({ error: "Employee not found." }, { status: 404 });
  }

  const rows = employees.map((employee) => [
    employee.id,
    employee.firstName,
    employee.lastName,
    employee.email,
    employee.jobTitle,
    employee.level ?? "",
    employee.department,
    employee.division,
    employee.team ?? "",
    employee.managerName ?? "",
    employee.startDate,
    employee.status,
    employee.workMode,
    employee.technologies ?? "",
    employee.lastWorkingDay ?? "",
    employee.terminationType ?? "",
    employee.terminationReasons ?? "",
    employee.rehireEligible ? "yes" : "no",
  ]);
  const csv = [
    [
      "ID",
      "First name",
      "Last name",
      "Work email",
      "Position",
      "Level",
      "Department",
      "Division",
      "Team",
      "Manager",
      "Start date",
      "Status",
      "Work mode",
      "Technologies",
      "Last working day",
      "Termination type",
      "Termination reasons (codes)",
      "Eligible for rehire",
    ],
    ...rows,
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${employeeId ? `incora-person-${employeeId}` : "incora-people"}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
