import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { mobilePushTokens } from "@/db/schema";
import { getApiClientUser } from "@/lib/auth";
import { parseJsonRequest } from "@/modules/shared/http";

const registerPushTokenSchema = z.object({
  token: z.string().trim().min(20).max(512),
  platform: z.enum(["android", "ios"]),
});

export async function POST(request: Request) {
  const client = await getApiClientUser(request);
  if (!client || client.clientType !== "mobile") {
    return Response.json(
      { error: "Mobile authentication is required." },
      { status: 401 },
    );
  }
  const parsed = await parseJsonRequest(request, registerPushTokenSchema);
  if (!parsed.ok) return parsed.response;
  const now = new Date().toISOString();
  await getDb()
    .insert(mobilePushTokens)
    .values({
      userEmail: client.user.email,
      userId: client.user.userId,
      token: parsed.data.token,
      platform: parsed.data.platform,
      active: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: mobilePushTokens.token,
      set: {
        userEmail: client.user.email,
        userId: client.user.userId,
        platform: parsed.data.platform,
        active: true,
        updatedAt: now,
      },
    });
  return Response.json({ registered: true });
}

export async function DELETE(request: Request) {
  const client = await getApiClientUser(request);
  if (!client || client.clientType !== "mobile") {
    return Response.json(
      { error: "Mobile authentication is required." },
      { status: 401 },
    );
  }
  const parsed = await parseJsonRequest(request, registerPushTokenSchema);
  if (!parsed.ok) return parsed.response;
  await getDb()
    .update(mobilePushTokens)
    .set({ active: false, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(mobilePushTokens.token, parsed.data.token),
        client.user.userId
          ? or(
              eq(mobilePushTokens.userId, client.user.userId),
              eq(mobilePushTokens.userEmail, client.user.email),
            )
          : eq(mobilePushTokens.userEmail, client.user.email),
      ),
    );
  return Response.json({ registered: false });
}
