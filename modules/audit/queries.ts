import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";

export function getAuditEvents() {
  return getDb()
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(50);
}
