import { z } from "zod";

export const updateNotificationsSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.id) !== Boolean(value.all), {
    message: "Choose one notification or all notifications.",
  });
