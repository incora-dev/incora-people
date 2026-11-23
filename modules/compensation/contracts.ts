import { z } from "zod";

export const compensationSchema = z.object({
  kind: z.enum(["base", "additional"]),
  label: z.string().trim().max(120).default(""),
  effectiveFrom: z.iso.date(),
  amount: z.coerce.number().finite().min(0).max(1_000_000_000),
  currency: z.enum(["USD", "EUR", "UAH"]),
  period: z.enum(["year", "month", "week", "day", "hour"]),
  paymentSchedule: z.enum(["weekly", "monthly", "quarterly"]),
  comment: z.string().trim().max(2000).default(""),
});

const amountSchema = z.coerce.number().finite().min(0).max(1_000_000_000);

export const compensationUpdateSchema = z.object({
  kind: z.enum(["base", "additional"]).optional(),
  label: z.string().trim().max(120).optional(),
  effectiveFrom: z.iso.date().optional(),
  amount: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    amountSchema.optional(),
  ),
  currency: z.enum(["USD", "EUR", "UAH"]).optional(),
  period: z.enum(["year", "month", "week", "day", "hour"]).optional(),
  paymentSchedule: z.enum(["weekly", "monthly", "quarterly"]).optional(),
  comment: z.string().trim().max(2000).optional(),
  removeAttachmentIds: z.array(z.string().min(1).max(200)).max(20).default([]),
});

export type CompensationUpdateInput = z.infer<typeof compensationUpdateSchema>;

export type CompensationInput = z.infer<typeof compensationSchema>;

export type CompensationListItem = {
  id: number;
  kind: "base" | "additional";
  label: string | null;
  effectiveFrom: string;
  currency: string;
  period: string;
  paymentSchedule: string;
  comment: string;
  isCurrent: boolean;
  attachments: Array<{ id: string; name: string }>;
};
