import { z } from "zod";

export const createLeaveRequestSchema = z.object({
  leaveTypeId: z.coerce.number().int().positive(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  duration: z.enum(["full", "half"]).default("full"),
  dailyAllocations: z
    .array(
      z.object({
        date: z.iso.date(),
        amount: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
      }),
    )
    .max(366)
    .optional(),
  reason: z.string().trim().max(500).default(""),
});

export const reviewLeaveRequestSchema = z.object({
  action: z.enum(["approved", "rejected", "withdrawn"]),
  note: z.string().trim().max(500).default(""),
});

export type CreateLeaveRequestInput = z.output<
  typeof createLeaveRequestSchema
> & { idempotencyKey?: string | null };
