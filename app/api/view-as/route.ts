import { z } from "zod";
import {
  hasRecentAuthentication,
  recentAuthenticationResponse,
} from "@/lib/auth";
import { getGoogleSessionIdentity } from "@/lib/google-auth";
import {
  createEmployeePreview,
  PreviewCommandError,
} from "@/modules/view-as/server";

const startSchema = z.object({
  employeeId: z.number().int().positive(),
});

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return forbidden();
  const identity = await getGoogleSessionIdentity();
  if (!identity) {
    return Response.json(
      { error: "A valid Google web session is required." },
      { status: 401, headers: noStore },
    );
  }
  const actor = {
    userId: identity.account.userId,
    email: identity.account.email,
    role: identity.account.role,
    employeeId: identity.account.employeeId,
    authenticatedAt: identity.authenticatedAt,
  };
  const body = await request.json().catch(() => null);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Choose a valid employee to preview." },
      { status: 400, headers: noStore },
    );
  }
  if (actor.role !== "super_admin") {
    try {
      await createEmployeePreview({
        actor,
        sessionId: identity.sessionId,
        employeeId: parsed.data.employeeId,
      });
    } catch {
      // The command records the denied attempt without sensitive details.
    }
    return Response.json(
      { error: "Only a Super Admin can start an employee preview." },
      { status: 403, headers: noStore },
    );
  }
  if (!hasRecentAuthentication(actor)) {
    return recentAuthenticationResponse("/employees");
  }
  try {
    const preview = await createEmployeePreview({
      actor,
      sessionId: identity.sessionId,
      employeeId: parsed.data.employeeId,
    });
    return Response.json(
      { returnPath: preview.returnPath, expiresAt: preview.expiresAt },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof PreviewCommandError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: noStore },
      );
    }
    return Response.json(
      { error: "Could not start employee preview." },
      { status: 500, headers: noStore },
    );
  }
}

function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  return (
    origin === new URL(request.url).origin &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}

function forbidden() {
  return Response.json(
    { error: "Same-origin request required." },
    { status: 403, headers: noStore },
  );
}

const noStore = { "cache-control": "private, no-store" };
