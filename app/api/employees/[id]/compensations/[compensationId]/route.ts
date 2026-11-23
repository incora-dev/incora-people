import { getAccessPolicy, getCurrentUser } from "@/lib/auth";
import { compensationUpdateSchema } from "@/modules/compensation/contracts";
import {
  deleteCompensationRecord,
  updateCompensationRecord,
} from "@/modules/compensation/commands";
import { createCompensationMutationHandlers } from "@/modules/compensation/management-handlers";
import {
  getCompensationForUpdate,
  getCompensationList,
} from "@/modules/compensation/queries";

const handlers = createCompensationMutationHandlers({
  getCurrentUser,
  getAccessPolicy,
  validateUpdateInput: (payload) => compensationUpdateSchema.safeParse(payload),
  getCompensationForUpdate,
  getCompensationList,
  updateCompensation: updateCompensationRecord,
  deleteCompensation: deleteCompensationRecord,
});

export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
