import { getCurrentUser } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { getLeaveOverview } from "@/lib/data";

export async function GET() {
  const user = await getCurrentUser();
  if (!user.employeeId)
    return new Response("Account is not linked.", { status: 403 });
  const { requests } = await getLeaveOverview(user.employeeId, user);
  const csv = [
    ["Type", "Start", "End", "Days", "Status", "Reason"],
    ...requests.map((item) => [
      item.typeName,
      item.startDate,
      item.endDate,
      String(item.days),
      item.status,
      item.reason,
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="incora-leave.csv"',
    },
  });
}
