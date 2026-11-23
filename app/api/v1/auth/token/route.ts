import { z } from "zod";
import {
  exchangeClientAuthorizationCode,
  refreshClientSession,
} from "@/lib/client-auth";
import { parseJsonRequest } from "@/modules/shared/http";

const tokenRequestSchema = z.discriminatedUnion("grantType", [
  z.object({
    grantType: z.literal("authorization_code"),
    code: z.string().min(20).max(300),
    codeVerifier: z.string().min(43).max(128),
    deviceId: z.string().trim().min(8).max(120),
  }),
  z.object({
    grantType: z.literal("refresh_token"),
    refreshToken: z.string().min(30).max(300),
    deviceId: z.string().trim().min(8).max(120),
  }),
]);

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, tokenRequestSchema);
  if (!parsed.ok) return parsed.response;
  const tokenSet =
    parsed.data.grantType === "authorization_code"
      ? await exchangeClientAuthorizationCode({
          code: parsed.data.code,
          codeVerifier: parsed.data.codeVerifier,
          deviceId: parsed.data.deviceId,
        })
      : await refreshClientSession({
          refreshToken: parsed.data.refreshToken,
          deviceId: parsed.data.deviceId,
        });
  if (!tokenSet) {
    return Response.json(
      { error: "Client authorization is invalid or expired." },
      { status: 401 },
    );
  }
  return Response.json(tokenSet, { headers: { "cache-control": "no-store" } });
}
