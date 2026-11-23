import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).default(""),
  category: z.enum(["general", "onboarding", "offboarding"]),
  assigneeEmployeeId: z.coerce.number().int().positive(),
  dueDate: z.union([z.iso.date(), z.literal("")]).default(""),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

export const updateTaskSchema = z.object({
  status: z.enum(["todo", "done"]),
});
