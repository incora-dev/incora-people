import { getCurrentUser } from "@/lib/auth";
import {
  attachStoredFile,
  deleteStoredFile,
  storePrivateFile,
  validatePrivateFile,
} from "@/modules/files/storage";
import { createReimbursement } from "@/modules/reimbursements/commands";
import { createReimbursementSchema } from "@/modules/reimbursements/contracts";
import { getReimbursementOverview } from "@/modules/reimbursements/queries";
import { applicationErrorResponse } from "@/modules/shared/application-error";

export async function GET() {
  const user = await getCurrentUser();
  if (!user.employeeId) {
    return Response.json(
      { error: "Employee account required." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(await getReimbursementOverview(user.employeeId, user), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user.employeeId) {
    return Response.json(
      { error: "Account is not linked to an employee." },
      { status: 403 },
    );
  }

  try {
    const form = await request.formData();
    const parsed = createReimbursementSchema.safeParse({
      amount: form.get("amount"),
      category: form.get("category"),
      expenseDate: form.get("expenseDate"),
      description: form.get("description"),
      receiptUrl: "",
    });
    if (!parsed.success) {
      return Response.json(
        {
          error: "Check the submitted fields.",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const receiptEntry = form.get("receipt");
    const receipt =
      receiptEntry instanceof File && receiptEntry.size > 0
        ? validatePrivateFile(receiptEntry)
        : undefined;
    const stored = receipt
      ? await storePrivateFile({
          file: receipt,
          kind: "reimbursement_receipt",
          category: "receipt",
          ownerEmployeeId: user.employeeId,
          user,
        })
      : undefined;

    let created;
    const idempotencyKey =
      request.headers.get("idempotency-key")?.trim().slice(0, 160) || null;
    try {
      created = await createReimbursement(user, {
        ...parsed.data,
        receiptUrl: stored ? `/api/files/${stored.id}` : "",
        idempotencyKey,
      });
    } catch (error) {
      if (stored) await deleteStoredFile(stored.id, user);
      throw error;
    }
    if (stored) {
      if (created.receiptUrl === `/api/files/${stored.id}`)
        await attachStoredFile(
          stored.id,
          "reimbursement_request",
          String(created.id),
        );
      else await deleteStoredFile(stored.id, user);
    }
    return Response.json(
      { request: created },
      { status: created.idempotencyKey ? 200 : 201 },
    );
  } catch (error) {
    return applicationErrorResponse(error);
  }
}
