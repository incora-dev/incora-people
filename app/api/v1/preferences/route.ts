import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getApiClientUser } from "@/lib/auth";
import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n";
import { parseJsonRequest } from "@/modules/shared/http";

const schema = z.object({ locale: z.enum(["uk", "en"]) });

export async function GET(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  const [account] = await getDb()
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.email, client.user.email))
    .limit(1);
  return Response.json({
    locale: normalizeLocale(account?.locale ?? DEFAULT_LOCALE),
  });
}

export async function PATCH(request: Request) {
  const client = await getApiClientUser(request);
  if (!client)
    return Response.json(
      { error: "Client authentication is required." },
      { status: 401 },
    );
  const parsed = await parseJsonRequest(request, schema);
  if (!parsed.ok) return parsed.response;
  await getDb()
    .update(users)
    .set({ locale: parsed.data.locale })
    .where(eq(users.email, client.user.email));
  return Response.json({ locale: parsed.data.locale });
}
