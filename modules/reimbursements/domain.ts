export const reimbursementCategories = [
  "Sport",
  "Health",
  "Education",
  "Other",
] as const;

export type ReimbursementCategory = (typeof reimbursementCategories)[number];

export function isReimbursementCategory(
  value: string,
): value is ReimbursementCategory {
  return reimbursementCategories.includes(value as ReimbursementCategory);
}
