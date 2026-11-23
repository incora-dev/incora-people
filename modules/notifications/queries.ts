import { desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";

export function getNotifications(user: Pick<CurrentUser, "userId" | "email">) {
  const owner = user.userId
    ? or(
        eq(notifications.userId, user.userId),
        eq(notifications.userEmail, user.email),
      )
    : eq(notifications.userEmail, user.email);
  return getDb()
    .select()
    .from(notifications)
    .where(owner)
    .orderBy(desc(notifications.createdAt))
    .limit(20);
}
