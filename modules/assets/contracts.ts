import { z } from "zod";

export const createAssetSchema = z.object({
  name: z.string().trim().min(2).max(120),
  assetTag: z
    .string()
    .trim()
    .min(2)
    .max(48)
    .transform((value) => value.toUpperCase()),
  category: z.enum(["equipment", "accessory", "software", "other"]),
  assignedEmployeeId: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .default(""),
  serialNumber: z.string().trim().max(100).default(""),
  note: z.string().trim().max(800).default(""),
});

export const updateAssetSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["available", "assigned", "repair", "retired"]),
  assignedEmployeeId: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .default(""),
  note: z.string().trim().max(800).default(""),
});
