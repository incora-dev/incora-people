import { getD1 } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import {
  createEmployeePreview as createPreview,
  endEmployeePreview as endPreview,
} from "./commands";
import { resolvePreviewSession } from "./session";

export { PreviewCommandError } from "./commands";

export function createEmployeePreview(input: {
  actor: CurrentUser;
  sessionId: string;
  employeeId: number;
}) {
  return createPreview(getD1(), input);
}

export function endEmployeePreview(input: {
  actorUserId: number;
  sessionId: string;
}) {
  return endPreview(getD1(), input);
}

export async function getPreviewContext(actor: CurrentUser, sessionId: string) {
  if (!actor.userId) return null;
  return resolvePreviewSession(getD1(), actor.userId, sessionId);
}
