import { z } from "zod";

const optionalText = (maximum = 200) =>
  z.string().trim().max(maximum).default("");
const optionalProvidedText = (maximum = 200) =>
  z.string().trim().max(maximum).optional();
const optionalDate = z.union([z.iso.date(), z.literal("")]).default("");
const optionalSensitiveDate = z.union([z.iso.date(), z.literal("")]).optional();
const optionalUnitId = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

export const createEmployeeSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email().trim().toLowerCase(),
  jobTitle: z.string().trim().min(1).max(150),
  department: z.string().trim().min(1).max(100),
  startDate: z.iso.date(),
  division: optionalText(100),
  team: optionalText(100),
  level: optionalText(100),
  probationEnd: z.union([z.iso.date(), z.literal("")]).optional(),
  divisionUnitId: optionalUnitId,
  departmentUnitId: optionalUnitId,
  teamUnitId: optionalUnitId,
});

export const updateEmployeeSchema = createEmployeeSchema.extend({
  startDate: z.iso.date().optional(),
  technologies: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  managerId: z.preprocess(
    (value) => (value === "" || value === null ? null : value),
    z.coerce.number().int().positive().nullable(),
  ),
  employeeCode: optionalText(50),
  ukrainianName: optionalText(200),
  personalEmail: z.union([z.email(), z.literal("")]).optional(),
  phone: optionalProvidedText(50),
  birthDate: optionalSensitiveDate,
  gender: optionalProvidedText(50),
  address: optionalProvidedText(500),
  employmentType: optionalText(100),
  location: optionalText(100).optional(),
  status: z.enum(["active", "on_leave", "inactive"]).default("active"),
  changeReason: optionalText(500),
  effectiveDate: z.union([z.iso.date(), z.literal("")]).optional(),
  employmentChange: z.boolean().optional().default(false),
  taxCode: optionalProvidedText(40),
  contractEndDate: optionalSensitiveDate,
  passportNumber: optionalProvidedText(80),
  passportDate: optionalSensitiveDate,
  passportAuthority: optionalProvidedText(200),
  legalEntityValueId: z.preprocess(
    (value) => (value === "" || value === null ? null : value),
    z.coerce.number().int().positive().nullable().optional(),
  ),
});

const employmentFieldsSchema = z.object({
  jobTitle: z.string().trim().min(1).max(150),
  division: optionalText(100),
  department: optionalText(100),
  team: optionalText(100),
  level: optionalText(100),
  location: optionalText(100),
  employmentType: optionalText(100),
  managerId: z.preprocess(
    (value) => (value === "" || value === null ? null : value),
    z.coerce.number().int().positive().nullable(),
  ),
  divisionUnitId: optionalUnitId,
  departmentUnitId: optionalUnitId,
  teamUnitId: optionalUnitId,
});

export const employmentChangeEmployeeSchema = employmentFieldsSchema.extend({
  employmentChange: z.literal(true),
  effectiveDate: z.iso.date(),
  changeReason: z.string().trim().min(1).max(500),
});

export const employmentCorrectionEmployeeSchema = employmentFieldsSchema.extend(
  {
    employmentEdit: z.literal(true),
  },
);

export const profileRecordKinds = [
  "skill",
  "education",
  "certification",
  "emergency_contact",
  "dependent",
  "experience",
  "compensation",
] as const;

export const createProfileRecordSchema = z
  .object({
    kind: z.enum(profileRecordKinds),
    title: z.string().trim().min(1).max(200),
    subtitle: optionalText(300),
    startedOn: optionalDate,
    endedOn: optionalDate,
    notes: optionalText(1000),
  })
  .superRefine((value, context) => {
    if (
      (value.kind === "emergency_contact" || value.kind === "dependent") &&
      (value.startedOn || value.endedOn)
    ) {
      context.addIssue({
        code: "custom",
        path: ["startedOn"],
        message: "This record type does not use validity dates.",
      });
    }
    if (value.startedOn && value.endedOn && value.endedOn < value.startedOn) {
      context.addIssue({
        code: "custom",
        path: ["endedOn"],
        message: "End date cannot be before start date.",
      });
    }
    if (value.kind === "emergency_contact") {
      if (!value.subtitle.trim()) {
        context.addIssue({
          code: "custom",
          path: ["subtitle"],
          message: "Add the contact relationship.",
        });
      }
      if (!value.notes.trim()) {
        context.addIssue({
          code: "custom",
          path: ["notes"],
          message: "Add the contact phone number.",
        });
      }
    }
  });

export const updateProfileRecordSchema = z.intersection(
  createProfileRecordSchema,
  z.object({ recordId: z.coerce.number().int().positive() }),
);

export const terminateEmployeeSchema = z.object({
  lastWorkingDay: z.iso.date(),
  terminationType: z.enum([
    "resignation",
    "mutual_agreement",
    "involuntary",
    "project_completion",
  ]),
  reasonCodes: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  description: optionalText(2000),
  rehireEligible: z.boolean().default(false),
  taskTransferEmployeeId: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .default(null),
});

export type TerminateEmployeeInput = z.infer<typeof terminateEmployeeSchema>;
