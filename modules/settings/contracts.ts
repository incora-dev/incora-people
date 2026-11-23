import { z } from "zod";

export const employeeDefaultsSchema = z.object({
  division: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(100),
  workMode: z.enum(["office", "remote"]),
  employmentType: z.string().trim().min(1).max(100),
  timezone: z.string().trim().min(1).max(100),
  workDays: z.string().regex(/^([1-7],)*[1-7]$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  breakMinutes: z.coerce.number().int().min(0).max(240),
  probationMonths: z.number().int().min(0).max(24).default(3),
});

export type EmployeeDefaults = z.infer<typeof employeeDefaultsSchema>;
