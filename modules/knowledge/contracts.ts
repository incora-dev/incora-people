import { z } from "zod";

export const createKnowledgeArticleSchema = z.object({
  sectionId: z.coerce.number().int().positive(),
  title: z.string().trim().min(3).max(160),
  category: z.string().trim().min(2).max(60),
  body: z.string().trim().min(10).max(12000),
  minimumRole: z
    .enum(["employee", "manager", "hr_admin", "super_admin"])
    .default("employee"),
  published: z.boolean().default(true),
  sharedEmployeeIds: z
    .array(z.coerce.number().int().positive())
    .max(200)
    .default([]),
});

export const createKnowledgeSectionSchema = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).default(""),
  minimumRole: z
    .enum(["employee", "manager", "hr_admin", "super_admin"])
    .default("employee"),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export const updateKnowledgeSectionSchema = createKnowledgeSectionSchema.extend(
  {
    id: z.coerce.number().int().positive(),
  },
);

export const updateKnowledgeArticleSchema = createKnowledgeArticleSchema.extend(
  {
    id: z.coerce.number().int().positive(),
  },
);
