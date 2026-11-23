import { z } from "zod";

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format();
    return Boolean(timeZone.trim());
  } catch {
    return false;
  }
}

/** Parse a canonical 24-hour clock value; minutes are validated separately. */
export function parseScheduleClockMinutes(value: string) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value.trim());
  if (!match) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

const dateTimeString = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Must be a valid date and time",
  });

export const manualTimeEntrySchema = z.object({
  clockIn: dateTimeString,
  clockOut: dateTimeString,
  note: z.string().trim().max(500).default(""),
  projectId: z.coerce.number().int().positive().optional().nullable(),
  timeCode: z
    .enum(["project", "internal", "learning", "admin"])
    .default("project"),
  workMode: z.enum(["office", "remote"]).default("office"),
});

export const updateTimeEntrySchema = manualTimeEntrySchema.extend({
  id: z.coerce.number().int().positive(),
});

export const timeToggleSchema = z.object({
  workMode: z.enum(["office", "remote"]).default("office"),
  projectId: z.coerce.number().int().positive().optional().nullable(),
  timeCode: z
    .enum(["project", "internal", "learning", "admin"])
    .default("project"),
});

export const autofillTimeEntrySchema = z.object({}).strict();

export const breakCommandSchema = z
  .object({
    action: z.enum(["start", "end"]).default("start"),
    breakId: z.coerce.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "end" && !value.breakId) {
      context.addIssue({
        code: "custom",
        path: ["breakId"],
        message: "breakId is required when ending a break",
      });
    }
  });

export const timeProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/),
});

export const timeCorrectionSchema = z.object({
  timeEntryId: z.coerce.number().int().positive(),
  requestedClockIn: dateTimeString,
  requestedClockOut: dateTimeString,
  reason: z.string().trim().min(5).max(500),
});

export const reviewTimeCorrectionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).default(""),
});

export const workScheduleSchema = z
  .object({
    workDays: z
      .string()
      .trim()
      .regex(/^[1-7](,[1-7])*$/),
    startTime: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/),
    endTime: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/),
    breakMinutes: z.coerce.number().int().min(0).max(180),
    timezone: z.string().trim().min(1).max(80),
  })
  .superRefine((value, context) => {
    const days = value.workDays.split(",");
    if (new Set(days).size !== days.length) {
      context.addIssue({
        code: "custom",
        path: ["workDays"],
        message: "Work days must not contain duplicates.",
      });
    }

    const startMinutes = parseScheduleClockMinutes(value.startTime);
    const endMinutes = parseScheduleClockMinutes(value.endTime);
    if (startMinutes === null) {
      context.addIssue({
        code: "custom",
        path: ["startTime"],
        message: "Start time must be a valid 24-hour time.",
      });
    }
    if (endMinutes === null) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "End time must be a valid 24-hour time.",
      });
    }
    if (startMinutes !== null && endMinutes !== null) {
      const duration = endMinutes - startMinutes;
      if (duration <= 0) {
        context.addIssue({
          code: "custom",
          path: ["endTime"],
          message: "End time must be later than start time.",
        });
      } else if (value.breakMinutes >= duration) {
        context.addIssue({
          code: "custom",
          path: ["breakMinutes"],
          message: "Break must be shorter than the scheduled work interval.",
        });
      }
    }
    if (!isValidTimeZone(value.timezone)) {
      context.addIssue({
        code: "custom",
        path: ["timezone"],
        message: "Timezone must be a valid IANA timezone.",
      });
    }
  });

export const updateTimesheetPeriodSchema = z.object({
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  status: z.enum(["open", "locked", "approved", "revision_required"]),
  note: z.string().trim().max(500).default(""),
});
