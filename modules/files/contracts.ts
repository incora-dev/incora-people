import { z } from "zod";

export const employeeDocumentCategories = [
  "contract",
  "identity",
  "tax",
  "policy",
  "other",
] as const;

export const employeeDocumentUploadSchema = z.object({
  category: z.enum(employeeDocumentCategories).default("other"),
  folderId: z.coerce.number().int().positive(),
});

export const employeeDocumentFolderSchema = z.object({
  name: z.string().trim().min(1).max(80),
  visibility: z.enum(["employee_hr", "hr_only"]),
});

export const moveEmployeeDocumentSchema = z.object({
  fileId: z.uuid(),
  folderId: z.coerce.number().int().positive(),
});

export type EmployeeDocumentCategory =
  (typeof employeeDocumentCategories)[number];
