import type { InvitationEmailPayload } from "@/modules/invitations/domain";

export type InvitationProviderResult =
  | { kind: "accepted"; messageId: string | null }
  | { kind: "rejected"; failureCode: string }
  | { kind: "uncertain"; failureCode: string };

export type InvitationProviderConfig = {
  apiKey: string;
  enabled: boolean;
};

export async function sendInvitationEmail(
  input: {
    attemptId: string;
    payload: InvitationEmailPayload;
  },
  config: InvitationProviderConfig,
  fetcher: typeof fetch = fetch,
): Promise<InvitationProviderResult> {
  if (!config.enabled || !config.apiKey) {
    return { kind: "rejected", failureCode: "provider_not_configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.attemptId,
      },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
    });

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as {
        id?: unknown;
      } | null;
      return {
        kind: "accepted",
        messageId: typeof body?.id === "string" ? body.id : null,
      };
    }

    if (response.status === 409 || response.status >= 500) {
      return {
        kind: "uncertain",
        failureCode:
          response.status === 409
            ? "provider_idempotency_in_progress"
            : "provider_temporary_error",
      };
    }

    return {
      kind: "rejected",
      failureCode:
        response.status === 401 || response.status === 403
          ? "provider_authentication"
          : response.status === 429
            ? "provider_rate_limit"
            : `provider_rejected_${response.status}`,
    };
  } catch {
    return { kind: "uncertain", failureCode: "provider_outcome_unknown" };
  } finally {
    clearTimeout(timeout);
  }
}
