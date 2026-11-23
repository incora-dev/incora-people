import type { CompensationUpdateInput } from "@/modules/compensation/contracts";

export type CompensationRecordForUpdate = {
  id: number;
  employeeId: number;
  kind: "base" | "additional";
  label: string | null;
  effectiveFrom: string;
  amountCents: number;
  currency: string;
  period: string;
  paymentSchedule: string;
  comment: string;
};

export function mergeCompensationUpdate(
  current: CompensationRecordForUpdate,
  input: CompensationUpdateInput,
) {
  return {
    kind: input.kind ?? current.kind,
    label: input.label === undefined ? current.label : input.label || null,
    effectiveFrom: input.effectiveFrom ?? current.effectiveFrom,
    amountCents:
      input.amount === undefined
        ? current.amountCents
        : Math.round(input.amount * 100),
    currency: input.currency ?? current.currency,
    period: input.period ?? current.period,
    paymentSchedule: input.paymentSchedule ?? current.paymentSchedule,
    comment: input.comment ?? current.comment,
  };
}
