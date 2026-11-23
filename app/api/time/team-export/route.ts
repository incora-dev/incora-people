import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { getDateContext } from "@/modules/shared/date";
import { getTeamTimesheets } from "@/modules/time/queries";
export async function GET(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.approveTime)
    return new Response("Time approval access required.", { status: 403 });
  const candidate = new URL(request.url).searchParams.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(candidate)
    ? candidate
    : getDateContext().monthKey;
  const rows = await getTeamTimesheets(user, month);
  const csv = [
    [
      "Employee",
      "Expected minutes",
      "Worked minutes",
      "Overtime minutes",
      "Project",
      "Internal",
      "Learning",
      "Admin",
      "Anomalies",
    ],
    ...rows.map((row) => [
      `${row.firstName} ${row.lastName}`,
      String(row.expectedMinutes),
      String(row.workedMinutes),
      String(row.overtimeMinutes),
      String(row.codeMinutes.project ?? 0),
      String(row.codeMinutes.internal ?? 0),
      String(row.codeMinutes.learning ?? 0),
      String(row.codeMinutes.admin ?? 0),
      String(row.openEntries + row.pendingCorrections + row.longEntries),
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="incora-team-time-${month}.csv"`,
    },
  });
}
