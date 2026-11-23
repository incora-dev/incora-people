import type { AccessPolicy, CurrentUser } from "@/lib/auth";

type CompensationRecord = {
  id: number;
  employeeId: number;
  amountCents: number;
  currency: string;
};

export function createCompensationRouteHandlers(dependencies: {
  getCurrentUser: () => Promise<CurrentUser>;
  getAccessPolicy: (user: CurrentUser) => Promise<AccessPolicy>;
  canReadSensitiveData: (
    employeeId: number,
    viewerEmployeeId: number | null,
    viewSensitiveData: boolean,
  ) => boolean;
  employeeExists: (employeeId: number) => Promise<boolean>;
  getCompensationList: (
    employeeId: number,
  ) => Promise<Record<string, unknown>[]>;
  getCompensationForReveal: (
    employeeId: number,
    compensationId: number,
  ) => Promise<CompensationRecord | undefined>;
  writeRevealAudit: (
    user: CurrentUser,
    record: CompensationRecord,
  ) => Promise<void>;
}) {
  return {
    async GET(_request: Request, context: { params: Promise<{ id: string }> }) {
      const userResult = await authenticate(dependencies.getCurrentUser);
      if (userResult.response) return userResult.response;
      const user = userResult.user;
      const access = await dependencies.getAccessPolicy(user);
      const employeeId = Number((await context.params).id);
      if (!validId(employeeId)) {
        return Response.json(
          { error: "Invalid employee id." },
          { status: 400 },
        );
      }
      if (
        !dependencies.canReadSensitiveData(
          employeeId,
          user.employeeId,
          access.viewSensitiveData,
        )
      ) {
        return Response.json(
          { error: "Compensation access denied." },
          { status: 403 },
        );
      }
      if (!(await dependencies.employeeExists(employeeId))) {
        return Response.json({ error: "Employee not found." }, { status: 404 });
      }
      const items = await dependencies.getCompensationList(employeeId);
      return Response.json(
        { items: items.map(toCompensationListDto) },
        { headers: { "cache-control": "private, no-store" } },
      );
    },

    async reveal(
      _request: Request,
      context: { params: Promise<{ id: string; compensationId: string }> },
    ) {
      const userResult = await authenticate(dependencies.getCurrentUser);
      if (userResult.response) return userResult.response;
      const user = userResult.user;
      const access = await dependencies.getAccessPolicy(user);
      const { id, compensationId } = await context.params;
      const employeeId = Number(id);
      const recordId = Number(compensationId);
      if (!validId(employeeId) || !validId(recordId)) {
        return Response.json(
          { error: "Invalid compensation record." },
          { status: 400 },
        );
      }
      if (
        !dependencies.canReadSensitiveData(
          employeeId,
          user.employeeId,
          access.viewSensitiveData,
        )
      ) {
        return Response.json(
          { error: "Compensation access denied." },
          { status: 403 },
        );
      }
      const record = await dependencies.getCompensationForReveal(
        employeeId,
        recordId,
      );
      if (!record) {
        return Response.json(
          { error: "Compensation record not found." },
          { status: 404 },
        );
      }
      try {
        await dependencies.writeRevealAudit(user, record);
      } catch {
        return Response.json(
          { error: "Could not record the sensitive-data access." },
          { status: 500, headers: { "cache-control": "private, no-store" } },
        );
      }
      return Response.json(
        { amountCents: record.amountCents, currency: record.currency },
        { headers: { "cache-control": "private, no-store" } },
      );
    },
  };
}

export function toCompensationListDto(row: Record<string, unknown>) {
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
