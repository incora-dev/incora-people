import { getApiClientUser } from "@/lib/auth";
import {
  attachStoredFile,
  deleteStoredFile,
  storePrivateFile,
  validatePrivateFile,
} from "@/modules/files/storage";
import { createReimbursement } from "@/modules/reimbursements/commands";
import { createReimbursementSchema } from "@/modules/reimbursements/contracts";
import { applicationErrorResponse } from "@/modules/shared/application-error";

export async function POST(request: Request) {
  const clientUser = await getApiClientUser(request);
  if (!clientUser?.user.employeeId)
    return Response.json(
      { error: "Employee account required." },
      { status: 403 },
    );
  try {
    const form = await request.formData();
    const parsed = createReimbursementSchema.safeParse({
      amount: form.get("amount"),
      category: form.get("category"),
      expenseDate: form.get("expenseDate"),
      description: form.get("description"),
      receiptUrl: "",
    });
    if (!parsed.success)
      return Response.json(
        {
          error: "Check the submitted fields.",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    const entry = form.get("receipt");
    const receipt =
      entry instanceof File && entry.size > 0
        ? validatePrivateFile(entry)
        : undefined;
    const stored = receipt
      ? await storePrivateFile({
          file: receipt,
          kind: "reimbursement_receipt",
          category: "receipt",
          ownerEmployeeId: clientUser.user.employeeId,
          user: clientUser.user,
        })
      : undefined;
    try {
      const created = await createReimbursement(clientUser.user, {
        ...parsed.data,
        receiptUrl: stored ? `/api/files/${stored.id}` : "",
        idempotencyKey:
          request.headers.get("idempotency-key")?.trim().slice(0, 160) || null,
      });
      if (stored) {
        if (created.receiptUrl === `/api/files/${stored.id}`)
          await attachStoredFile(
            stored.id,
            "reimbursement_request",
            String(created.id),
          );
        else await deleteStoredFile(stored.id, clientUser.user);
      }
      return Response.json(
        { request: created },
        { status: created.idempotencyKey ? 200 : 201 },
      );
    } catch (error) {
      if (stored) await deleteStoredFile(stored.id, clientUser.user);
      throw error;
    }
  } catch (error) {
    return applicationErrorResponse(error);
  }
}
