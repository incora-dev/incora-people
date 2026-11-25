import { z } from "zod";
import { parseManualDate } from "@/modules/people/dates";
import { isValidInventoryCountSelection } from "@/modules/inventory/domain";

const positiveId = z.coerce.number().int().positive();
const optionalId = positiveId.nullable().optional();
const name = z.string().trim().min(2).max(120);
const description = z.string().trim().max(1000).default("");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-");
    return parseManualDate(`${day}.${month}.${year}`) === value;
  }, "Enter a valid calendar date.");

const activeDate = z.string().pipe(isoDate).nullable().optional();

const category = z.object({
  action: z.literal("category.save"),
  id: positiveId.optional(),
  name,
  description,
  sortOrder: z.coerce.number().int().min(-10000).max(10000).default(0),
  active: z.boolean().default(true),
});

const group = z.object({
  action: z.literal("group.save"),
  id: positiveId.optional(),
  categoryId: positiveId,
  name,
  defaultLocationId: optionalId,
  notes: description,
  active: z.boolean().default(true),
});

const location = z.object({
  action: z.literal("location.save"),
  id: positiveId.optional(),
  name,
  description,
  active: z.boolean().default(true),
});

/**
 * Asset details of an inventory item (laptops, monitors and other equipment).
 * Optional: when omitted, a save leaves the stored details unchanged.
 */
export const inventoryAssetDetailsSchema = z.object({
  serialNumber: z.string().trim().max(100).default(""),
  price: z.string().trim().max(60).default(""),
  division: z.string().trim().max(120).default(""),
  department: z.string().trim().max(120).default(""),
  warrantyEnds: activeDate,
  repairHistory: z.string().trim().max(2000).default(""),
  attributes: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        value: z.string().trim().min(1).max(200),
      }),
    )
    .max(30)
    .default([]),
  assignedEmployeeId: positiveId.nullable().default(null),
  assigneeName: z.string().trim().max(160).default(""),
  assignedSince: activeDate,
});

const item = z.object({
  action: z.literal("item.save"),
  id: positiveId.optional(),
  groupId: positiveId,
  sku: z
    .string()
    .trim()
    .min(2)
    .max(48)
    .transform((value) => value.toUpperCase()),
  name,
  description,
  unit: z.string().trim().min(1).max(24).default("шт."),
  active: z.boolean().default(true),
  nextInventoryDate: activeDate,
  assetDetails: inventoryAssetDetailsSchema.optional(),
});

const minimum = z.object({
  action: z.literal("stock.minimum"),
  itemId: positiveId,
  locationId: positiveId,
  minimumQuantity: z.coerce.number().int().min(0).max(1_000_000),
});

const movement = z
  .object({
    action: z.literal("stock.move"),
    requestId: z.string().trim().min(8).max(100),
    operationType: z.enum(["initial_stock", "receipt", "decrease", "transfer"]),
    itemId: positiveId,
    sourceLocationId: positiveId,
    destinationLocationId: positiveId.optional(),
    quantity: z.coerce.number().int().positive().max(1_000_000),
    expectedSourceVersion: z.coerce.number().int().min(0),
    expectedDestinationVersion: z.coerce.number().int().min(0).optional(),
    reason: z.string().trim().min(2).max(500),
  })
  .superRefine((value, ctx) => {
    if (value.operationType === "transfer") {
      if (
        !value.destinationLocationId ||
        value.destinationLocationId === value.sourceLocationId
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["destinationLocationId"],
          message: "Choose a different destination location.",
        });
      }
      if (value.expectedDestinationVersion === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["expectedDestinationVersion"],
          message: "A destination stock version is required.",
        });
      }
    } else if (value.destinationLocationId !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationLocationId"],
        message: "Destination is only valid for transfers.",
      });
    }
  });

const countCreate = z
  .object({
    action: z.literal("count.create"),
    countId: z.string().trim().min(8).max(100),
    locationId: positiveId,
    countDate: isoDate,
    notes: z.string().trim().max(1000).default(""),
    scopeType: z.enum(["location", "group", "item"]),
    scopeId: positiveId,
    itemIds: z.array(positiveId).min(1).max(1000),
  })
  .superRefine((value, ctx) => {
    if (
      !isValidInventoryCountSelection(
        value.scopeType,
        value.scopeId,
        value.itemIds,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["itemIds"],
        message: "Select unique items that match the explicit count scope.",
      });
    }
  });

const countUpdateSelection = z
  .object({
    action: z.literal("count.update-selection"),
    countId: z.string().trim().min(8).max(100),
    itemIds: z.array(positiveId).min(1).max(1000),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.itemIds).size !== value.itemIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["itemIds"],
        message: "Duplicate inventory count item.",
      });
    }
  });

const countLine = z.object({
  action: z.literal("count.set-line"),
  countId: z.string().trim().min(8).max(100),
  itemId: positiveId,
  countedQuantity: z.coerce.number().int().min(0).max(1_000_000),
});

const countLines = z
  .object({
    action: z.literal("count.save-lines"),
    countId: z.string().trim().min(8).max(100),
    lines: z
      .array(
        z.object({
          itemId: positiveId,
          countedQuantity: z.number().int().min(0).max(1_000_000).nullable(),
        }),
      )
      .min(1)
      .max(1000),
  })
  .superRefine((value, ctx) => {
    const ids = value.lines.map((line) => line.itemId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Duplicate inventory count item.",
      });
    }
  });

const countRefresh = z.object({
  action: z.literal("count.refresh"),
  countId: z.string().trim().min(8).max(100),
});

const countFinalize = z.object({
  action: z.literal("count.finalize"),
  countId: z.string().trim().min(8).max(100),
});

const correction = z.discriminatedUnion("targetType", [
  z.object({
    action: z.literal("history.correct"),
    requestId: z.string().trim().min(8).max(100),
    targetType: z.literal("movement"),
    targetId: positiveId,
    correctedValue: z.coerce.number().int().min(0).max(1_000_000),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({
    action: z.literal("history.correct"),
    requestId: z.string().trim().min(8).max(100),
    targetType: z.literal("count_line"),
    targetId: positiveId,
    correctedValue: z.coerce.number().int().min(0).max(1_000_000),
    reason: z.string().trim().min(5).max(500),
  }),
]);

export const inventoryCommandSchema = z.discriminatedUnion("action", [
  category,
  group,
  location,
  item,
  minimum,
  movement,
  countCreate,
  countUpdateSelection,
  countLine,
  countLines,
  countRefresh,
  countFinalize,
  correction,
]);

export type InventoryCommand = z.output<typeof inventoryCommandSchema>;
