import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";
import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import {
  getCompensationForReveal,
  getCompensationList,
} from "@/modules/compensation/queries";
import { employeeExists } from "@/modules/people/queries";
import { createCompensationRouteHandlers } from "@/modules/compensation/handlers";
import { canReadEmployeeSensitiveData } from "@/modules/people/privacy";

export const compensationRouteHandlers = createCompensationRouteHandlers({
  getCurrentUser,
  getAccessPolicy,
  canReadSensitiveData: canReadEmployeeSensitiveData,
  employeeExists,
  getCompensationList,
  getCompensationForReveal,
  writeRevealAudit: async (user, record) => {
    await getDb()
      .insert(auditEvents)
      .values({
        actorEmail: user.email,
        action: "employee.compensation_revealed",
        entityType: "employee_compensation",
        entityId: String(record.id),
        details: "Compensation amount revealed by an authorized user",
      });
  },
});
