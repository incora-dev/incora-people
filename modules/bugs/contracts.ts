import { z } from "zod";

export const bugDescriptionSchema = z.string().trim().min(10).max(3000);

export const updateBugReportSchema = z.object({
  status: z.enum(["open", "resolved"]),
});
