import type { Role } from "@/lib/auth";

export const ROLE_ORDER: readonly Role[] = [
  "employee",
  "manager",
  "hr_admin",
  "super_admin",
];

export function isRole(value: string): value is Role {
  return ROLE_ORDER.includes(value as Role);
}

export function hasMinimumRole(role: Role, minimumRole: string) {
  const minimumIndex = ROLE_ORDER.indexOf(minimumRole as Role);
  return minimumIndex >= 0 && ROLE_ORDER.indexOf(role) >= minimumIndex;
}
