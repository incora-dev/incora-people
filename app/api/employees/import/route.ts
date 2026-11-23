import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { createEmployee } from "@/modules/people/commands";
import { createEmployeeSchema } from "@/modules/people/contracts";
import { csvRowsToObjects } from "@/modules/people/csv";
import { ApplicationError } from "@/modules/shared/application-error";

const templateHeaders = [
  "firstName",
  "lastName",
  "email",
  "jobTitle",
  "department",
  "startDate",
  "division",
  "team",
  "level",
  "probationEnd",
];

export async function GET() {
  return new Response(
    `${templateHeaders.join(",")}\nJane,Doe,jane.doe@incorainc.com,Software Engineer,Engineering,2026-08-01,Ukraine,Web Platform,Middle,\n`,
    {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition":
          'attachment; filename="incora-people-import-template.csv"',
      },
    },
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const access = await getAccessPolicy(user);
  if (!access.managePeople) {
    return Response.json(
      { error: "HR administrator access required." },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose a CSV file." }, { status: 400 });
  }
  if (file.size > 1_000_000) {
    return Response.json(
      { error: "CSV files must be smaller than 1 MB." },
      { status: 413 },
    );
  }

  let rows: Record<string, string>[];
  try {
    rows = csvRowsToObjects(await file.text());
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not parse the CSV.",
      },
      { status: 400 },
    );
  }

  if (rows.length === 0 || rows.length > 250) {
    return Response.json(
      { error: "CSV must contain between 1 and 250 employee rows." },
      { status: 400 },
    );
  }

  const parsedRows = rows.map((row, index) => ({
    row: index + 2,
    result: createEmployeeSchema.safeParse(row),
  }));
  const validationErrors = parsedRows
    .filter((item) => !item.result.success)
    .map((item) => ({
      row: item.row,
      error: "Missing or invalid employee fields.",
      fields: item.result.error?.flatten().fieldErrors,
    }));
  if (validationErrors.length) {
    return Response.json(
      { error: "Fix the invalid CSV rows.", rows: validationErrors },
      { status: 400 },
    );
  }

  const emails = new Set<string>();
  for (const item of parsedRows) {
    const email = item.result.data!.email;
    if (emails.has(email)) {
      return Response.json(
        { error: `The CSV contains the email ${email} more than once.` },
        { status: 400 },
      );
    }
    emails.add(email);
  }

  const created: Array<{ id: number; email: string }> = [];
  const failed: Array<{ row: number; error: string }> = [];
  for (const item of parsedRows) {
    try {
      const employee = await createEmployee(user, item.result.data!);
      created.push({ id: employee.id, email: employee.email });
    } catch (error) {
      failed.push({
        row: item.row,
        error:
          error instanceof ApplicationError
            ? error.message
            : "Could not import this row.",
      });
    }
  }

  return Response.json(
    {
      created: created.length,
      failed,
      message: `${created.length} employee${created.length === 1 ? "" : "s"} imported.`,
    },
    { status: created.length > 0 ? 201 : 409 },
  );
}
