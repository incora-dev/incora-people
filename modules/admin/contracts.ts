import { z } from "zod";

export const companyHolidaySchema = z.object({
  date: z.iso.date(),
  name: z.string().trim().min(2).max(120),
});

const optionalHttpUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      !value ||
      (() => {
        try {
          return ["http:", "https:"].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      })(),
    "Use a valid http or https URL.",
  );

export const companyEventSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).default(""),
  startsAt: z.iso.datetime({ local: true }),
  endsAt: z.iso.datetime({ local: true }).optional().or(z.literal("")),
  location: z.string().trim().max(160).default(""),
  url: optionalHttpUrl.optional().default(""),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(20000),
  publishedAt: z.iso.datetime({ local: true }),
  expiresAt: z.iso.datetime({ local: true }).optional().or(z.literal("")),
  pinned: z.boolean().optional().default(false),
  pollQuestions: z.string().trim().max(30000).optional().default("[]"),
});

export const companyLinkSchema = z.object({
  label: z.string().trim().min(2).max(100),
  url: optionalHttpUrl.refine(Boolean, "URL is required."),
  description: z.string().trim().max(300).default(""),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});
