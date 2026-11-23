import { z } from "zod";
import { reimbursementCategories } from "@/modules/reimbursements/domain";

export const createReimbursementSchema = z.object({
  amount: z.coerce.number().positive().finite(),
  category: z.enum(reimbursementCategories),
  expenseDate: z.iso.date(),
  description: z.string().trim().min(1).max(1000),
  receiptUrl: z
    .union([z.url({ protocol: /^https?$/ }), z.literal("")])
    .default(""),
});

export const reviewReimbursementSchema = z.object({
  action: z.enum(["approved", "rejected", "withdrawn"]),
  note: z.string().trim().max(500).default(""),
});

export type CreateReimbursementInput = z.output<
  typeof createReimbursementSchema
> & { idempotencyKey?: string | null };
