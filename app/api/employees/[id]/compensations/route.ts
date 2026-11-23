import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, employeeCompensations } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { getCompensationList } from "@/modules/compensation/queries";
import { compensationSchema } from "@/modules/compensation/contracts";
import { getEmployee } from "@/modules/people/queries";
import {
  attachStoredFile,
  deleteStoredFile,
  storePrivateFile,
  validatePrivateFile,
} from "@/modules/files/storage";
import { applicationErrorResponse } from "@/modules/shared/application-error";
import { compensationRouteHandlers } from "@/modules/compensation/api-handlers";
import { compensationMutationAccessResponse } from "@/modules/compensation/management-handlers";

export const GET = compensationRouteHandlers.GET;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const accessDenied = compensationMutationAccessResponse(
    await getAccessPolicy(user),
  );
  if (accessDenied) return accessDenied;
  const employeeId = Number((await params).id);
  if (!Number.isInteger(employeeId) || employeeId <= 0)
    return Response.json({ error: "Invalid employee id." }, { status: 400 });
  if (!(await getEmployee(employeeId)))
    return Response.json({ error: "Employee not found." }, { status: 404 });

  let body: Record<string, FormDataEntryValue>;
  let files: File[] = [];
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    body = Object.fromEntries(
      [...form.entries()].filter(([key]) => key !== "files"),
    );
    files = form
      .getAll("files")
      .filter(
        (value): value is File => value instanceof File && value.size > 0,
      );
  } else {
    const parsedJson = await request.json().catch(() => null);
    body =
      parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)
        ? (parsedJson as Record<string, FormDataEntryValue>)
        : {};
  }
  const parsed = compensationSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Check the compensation details." },
      { status: 400 },
    );

  try {
    files = files.map((file) => validatePrivateFile(file));
  } catch (error) {
    return applicationErrorResponse(error);
  }

  const now = new Date().toISOString();
  const db = getDb();
  let compensationId: number | null = null;
  const storedIds: string[] = [];
  try {
    const [record] = await db
      .insert(employeeCompensations)
      .values({
        employeeId,
        kind: parsed.data.kind,
        label: parsed.data.label || null,
        effectiveFrom: parsed.data.effectiveFrom,
        amountCents: Math.round(parsed.data.amount * 100),
        currency: parsed.data.currency,
        period: parsed.data.period,
        paymentSchedule: parsed.data.paymentSchedule,
        comment: parsed.data.comment,
        createdByEmail: user.email,
        updatedAt: now,
      })
      .returning({ id: employeeCompensations.id });
    compensationId = record.id;
    for (const file of files) {
      const stored = await storePrivateFile({
        file,
        kind: "compensation_attachment",
        category: "contract",
        ownerEmployeeId: employeeId,
        user,
        visibility: "hr_only",
      });
      storedIds.push(stored.id);
      await attachStoredFile(
        stored.id,
        "employee_compensation",
        String(compensationId),
      );
    }
    await db.insert(auditEvents).values({
      actorEmail: user.email,
      action: "employee.compensation_created",
      entityType: "employee_compensation",
      entityId: String(compensationId),
      details: `${parsed.data.kind} compensation record added`,
    });
    return Response.json(
      { items: await getCompensationList(employeeId) },
      { status: 201, headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    for (const id of storedIds)
      await deleteStoredFile(id, user).catch(() => {});
    if (compensationId !== null) {
      await db
        .delete(employeeCompensations)
        .where(eq(employeeCompensations.id, compensationId))
        .catch(() => {});
    }
    const message = error instanceof Error ? error.message : "";
    if (message.includes("employee_compensations_base_effective_unique"))
      return Response.json(
        { error: "A base compensation already exists for this date." },
        { status: 409 },
      );
    return applicationErrorResponse(error);
  }
}
