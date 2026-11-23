import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { parseJsonRequest } from "@/modules/shared/http";

const preferenceSchema = z.object({
  locale: z.enum(["uk", "en"]),
});

export async function GET() {
  const user = await getCurrentUser();
  const [account] = await getDb()
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.email, user.email))
    .limit(1);
  return Response.json({
    locale: normalizeLocale(account?.locale ?? DEFAULT_LOCALE),
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  const parsed = await parseJsonRequest(request, preferenceSchema);
  if (!parsed.ok) return parsed.response;

  await getDb()
    .update(users)
    .set({ locale: parsed.data.locale })
    .where(eq(users.email, user.email));
  (await cookies()).set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    maxAge: 365 * 24 * 60 * 60,
  });
  return Response.json({ locale: parsed.data.locale });
}
