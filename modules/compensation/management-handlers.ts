import type { AccessPolicy, CurrentUser } from "@/lib/auth";
import type { CompensationUpdateInput } from "./contracts";
import type { CompensationRecordForUpdate } from "./domain";

type UpdateFile = File;

export function compensationMutationAccessResponse(
  access: Pick<AccessPolicy, "managePeople" | "viewSensitiveData">,
) {
  return access.managePeople && access.viewSensitiveData
    ? null
    : Response.json(
        { error: "HR administrator access required." },
        { status: 403 },
      );
}

export function createCompensationMutationHandlers(dependencies: {
  getCurrentUser: () => Promise<CurrentUser>;
  getAccessPolicy: (user: CurrentUser) => Promise<AccessPolicy>;
  validateUpdateInput: (
    payload: unknown,
  ) => { success: true; data: CompensationUpdateInput } | { success: false };
  getCompensationForUpdate: (
    employeeId: number,
    compensationId: number,
  ) => Promise<CompensationRecordForUpdate | undefined>;
  getCompensationList: (
    employeeId: number,
  ) => Promise<Record<string, unknown>[]>;
  updateCompensation: (
    current: CompensationRecordForUpdate,
    input: CompensationUpdateInput,
    files: UpdateFile[],
    user: CurrentUser,
  ) => Promise<boolean | { updated: true; cleanupFailures: number }>;
  deleteCompensation: (
    current: CompensationRecordForUpdate,
    user: CurrentUser,
  ) => Promise<boolean | { deleted: true; cleanupFailures: number }>;
}) {
  return {
    async PATCH(
      request: Request,
      context: {
        params: Promise<{ id: string; compensationId: string }>;
      },
    ) {
      const userResult = await authenticate(dependencies.getCurrentUser);
      if (userResult.response) return userResult.response;
      const user = userResult.user;
      const access = await dependencies.getAccessPolicy(user);
      const accessDenied = compensationMutationAccessResponse(access);
      if (accessDenied) return accessDenied;

      const { id, compensationId } = await context.params;
      const employeeId = Number(id);
      const recordId = Number(compensationId);
      if (!validId(employeeId) || !validId(recordId))
        return Response.json(
          { error: "Invalid compensation record." },
          { status: 400 },
        );

      const parsedRequest = await parseUpdateRequest(request);
      if (!parsedRequest)
        return Response.json(
          { error: "Check the compensation details." },
          { status: 400 },
        );
      const parsed = dependencies.validateUpdateInput(parsedRequest.payload);
      if (!parsed.success)
        return Response.json(
          { error: "Check the compensation details." },
          { status: 400 },
        );

      const current = await dependencies.getCompensationForUpdate(
        employeeId,
        recordId,
      );
      if (!current)
        return Response.json(
          { error: "Compensation record not found." },
          { status: 404 },
        );

      try {
        const updated = await dependencies.updateCompensation(
          current,
          parsed.data,
          parsedRequest.files,
          user,
        );
        if (!updated)
          return Response.json(
            { error: "Compensation record not found." },
            { status: 404 },
          );
        return Response.json(
          {
            items: (await dependencies.getCompensationList(employeeId)).map(
              toCompensationListDto,
            ),
            attachmentCleanupPending:
              typeof updated === "object" && updated.cleanupFailures > 0,
          },
          { headers: { "cache-control": "private, no-store" } },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "INVALID_COMPENSATION_ATTACHMENTS")
          return Response.json(
            { error: "One or more attachments do not belong to this record." },
            { status: 400 },
          );
        if (message.includes("employee_compensations_base_effective_unique"))
          return Response.json(
            { error: "A base compensation already exists for this date." },
            { status: 409 },
          );
        return Response.json(
          { error: "Could not update compensation." },
          { status: 500 },
        );
      }
    },

    async DELETE(
      _request: Request,
      context: {
        params: Promise<{ id: string; compensationId: string }>;
      },
    ) {
      const userResult = await authenticate(dependencies.getCurrentUser);
      if (userResult.response) return userResult.response;
      const user = userResult.user;
      const access = await dependencies.getAccessPolicy(user);
      const accessDenied = compensationMutationAccessResponse(access);
      if (accessDenied) return accessDenied;

      const { id, compensationId } = await context.params;
      const employeeId = Number(id);
      const recordId = Number(compensationId);
      if (!validId(employeeId) || !validId(recordId))
        return Response.json(
          { error: "Invalid compensation record." },
          { status: 400 },
        );
      const current = await dependencies.getCompensationForUpdate(
        employeeId,
        recordId,
      );
      if (!current)
        return Response.json(
          { error: "Compensation record not found." },
          { status: 404 },
        );
      try {
        const deleted = await dependencies.deleteCompensation(current, user);
        if (!deleted)
          return Response.json(
            { error: "Compensation record not found." },
            { status: 404 },
          );
        return Response.json(
          {
            items: (await dependencies.getCompensationList(employeeId)).map(
              toCompensationListDto,
            ),
            attachmentCleanupPending:
              typeof deleted === "object" && deleted.cleanupFailures > 0,
          },
          { headers: { "cache-control": "private, no-store" } },
        );
      } catch {
        return Response.json(
          { error: "Could not delete compensation and its attachments." },
          { status: 500 },
        );
      }
    },
  };
}

async function parseUpdateRequest(request: Request) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const payload: Record<string, unknown> = {};
      for (const [key, value] of form.entries()) {
        if (key === "files" || key === "removeAttachmentIds") continue;
        payload[key] = value;
      }
      const removeAttachmentIds = form.get("removeAttachmentIds");
      if (typeof removeAttachmentIds === "string" && removeAttachmentIds) {
        payload.removeAttachmentIds = JSON.parse(removeAttachmentIds);
      }
      const files = form
        .getAll("files")
        .filter(
          (value): value is File => value instanceof File && value.size > 0,
        );
      return { payload, files };
    } catch {
      return null;
    }
  }

  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  return { payload: payload as Record<string, unknown>, files: [] as File[] };
}

async function authenticate(getCurrentUser: () => Promise<CurrentUser>) {
  try {
    return { user: await getCurrentUser(), response: null } as const;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AuthenticationRequiredError"
    ) {
      return {
        user: null,
        response: Response.json(
          { error: "Authentication required." },
          { status: 401 },
        ),
      } as const;
    }
    throw error;
  }
}

function validId(value: number) {
  return Number.isInteger(value) && value > 0;
}

function toCompensationListDto(row: Record<string, unknown>) {
  const attachments = Array.isArray(row.attachments)
    ? row.attachments
        .filter(
          (item): item is { id: string; name: string } =>
            !!item &&
            typeof item === "object" &&
            typeof (item as { id?: unknown }).id === "string" &&
            typeof (item as { name?: unknown }).name === "string",
        )
        .map(({ id, name }) => ({ id, name }))
    : [];
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    effectiveFrom: row.effectiveFrom,
    currency: row.currency,
    period: row.period,
    paymentSchedule: row.paymentSchedule,
    comment: row.comment,
    isCurrent: row.isCurrent,
    attachments,
  };
}
