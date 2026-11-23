import { z } from "zod";

export const saveOneOnOnePlanSchema = z.object({
  action: z.literal("plan"),
  employeeId: z.coerce.number().int().positive(),
  cadenceDays: z.coerce.number().int().min(7).max(365),
  active: z.boolean().default(true),
});

export const recordOneOnOneSchema = z
  .object({
    action: z.literal("meeting"),
    requestId: z.string().uuid().optional(),
    planId: z.coerce.number().int().positive().optional(),
    employeeId: z.coerce.number().int().positive().optional(),
    heldAt: z.string().date(),
    notes: z.string().trim().max(5000).default(""),
    sharedWithEmployee: z.boolean().default(false),
    sharedWithManager: z.boolean().default(false),
    cadenceDays: z.coerce.number().int().min(7).max(365).default(30),
    riskStatus: z
      .enum(["low_risk", "medium_risk", "high_risk", "problem"])
      .nullable()
      .default(null),
    reason: z.string().trim().max(4000).default(""),
    feedback: z.string().trim().max(8000).default(""),
    waysToSolve: z.string().trim().max(8000).default(""),
  })
  .refine(
    (value) => value.planId !== undefined || value.employeeId !== undefined,
    {
      message: "Select an employee or plan.",
    },
  );

export const updateOneOnOneMeetingSchema = z.object({
  action: z.literal("meeting.update"),
  meetingId: z.coerce.number().int().positive(),
  heldAt: z.string().date(),
  riskStatus: z
    .enum(["low_risk", "medium_risk", "high_risk", "problem"])
    .nullable(),
  reason: z.string().trim().max(4000),
  feedback: z.string().trim().max(8000),
  waysToSolve: z.string().trim().max(8000),
});

export const deleteOneOnOneMeetingSchema = z.object({
  action: z.literal("meeting.delete"),
  meetingId: z.coerce.number().int().positive(),
});

export const updateOneOnOnePlanSchema = z.object({
  action: z.literal("plan.update"),
  planId: z.coerce.number().int().positive(),
  nextDueDate: z.string().date(),
  cadenceDays: z.coerce.number().int().min(7).max(365),
});

export const saveOneOnOneNoteSchema = z.object({
  action: z.literal("note.save"),
  noteId: z.string().uuid().optional(),
  meetingId: z.coerce.number().int().positive(),
  noteType: z.enum([
    "private_author",
    "selected_recipients",
    "employee_or_team",
  ]),
  body: z.string().trim().min(1).max(10000),
  recipientUserIds: z
    .array(z.coerce.number().int().positive())
    .max(100)
    .default([]),
  includeEmployee: z.boolean().default(false),
  teamIds: z.array(z.coerce.number().int().positive()).max(50).default([]),
});

export const saveOneOnOneRuleSchema = z.object({
  action: z.literal("rule"),
  audience: z.enum(["developers", "managers", "probation"]),
  cadenceDays: z.coerce.number().int().min(7).max(365),
  active: z.boolean().default(true),
});

export const syncOneOnOnePlansSchema = z.object({
  action: z.literal("sync"),
});

export const updateOneOnOneMeetingAccessSchema = z.object({
  action: z.literal("meeting_access"),
  meetingId: z.coerce.number().int().positive(),
  sharedWithEmployee: z.boolean(),
  sharedWithManager: z.boolean(),
});

export const oneOnOneCommandSchema = z.discriminatedUnion("action", [
  saveOneOnOnePlanSchema,
  recordOneOnOneSchema,
  updateOneOnOneMeetingSchema,
  deleteOneOnOneMeetingSchema,
  updateOneOnOnePlanSchema,
  saveOneOnOneNoteSchema,
  saveOneOnOneRuleSchema,
  syncOneOnOnePlansSchema,
  updateOneOnOneMeetingAccessSchema,
]);

export type OneOnOneCommand = z.infer<typeof oneOnOneCommandSchema>;
