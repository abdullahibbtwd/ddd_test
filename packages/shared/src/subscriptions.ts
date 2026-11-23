import { z } from "zod";
import { PageQuerySchema } from "./page-query";
import { ServiceTypeSchema } from "./service-type";
import { SubscriptionFrequencySchema } from "./subscription-frequency";

const booleanQuery = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    return value === "true";
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (YYYY-MM-DD)");

const servicesSchema = z
  .array(ServiceTypeSchema)
  .min(1)
  .superRefine((services, ctx) => {
    if (new Set(services).size !== services.length) {
      ctx.addIssue({
        code: "custom",
        message: "services must not contain duplicates",
      });
    }
  });

export const SubscriptionSiteSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export type SubscriptionSiteSummary = z.infer<typeof SubscriptionSiteSummarySchema>;

export const SubscriptionCurrentSummarySchema = z.object({
  id: z.uuid(),
  frequency: SubscriptionFrequencySchema,
  services: z.array(ServiceTypeSchema).min(1),
  rate: z.number().nonnegative(),
  rateIncludesVat: z.boolean(),
  startDate: dateString,
  endDate: dateString.nullable(),
});

export type SubscriptionCurrentSummary = z.infer<
  typeof SubscriptionCurrentSummarySchema
>;

export const SubscriptionItemSchema = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  site: SubscriptionSiteSummarySchema,
  services: z.array(ServiceTypeSchema).min(1),
  frequency: SubscriptionFrequencySchema,
  rate: z.number().nonnegative(),
  rateIncludesVat: z.boolean(),
  startDate: dateString,
  endDate: dateString.nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SubscriptionItem = z.infer<typeof SubscriptionItemSchema>;

export const SubscriptionListQuerySchema = PageQuerySchema.extend({
  siteId: z.uuid().optional(),
  current: booleanQuery,
});

export type SubscriptionListQuery = z.infer<typeof SubscriptionListQuerySchema>;

export const SubscriptionPageSchema = z.object({
  items: z.array(SubscriptionItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type SubscriptionPage = z.infer<typeof SubscriptionPageSchema>;

export const CreateSubscriptionBodySchema = z
  .object({
    siteId: z.uuid(),
    services: servicesSchema,
    frequency: SubscriptionFrequencySchema,
    rate: z.number().nonnegative(),
    rateIncludesVat: z.boolean(),
    startDate: dateString,
    endDate: dateString.nullable().optional(),
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    if (value.endDate != null && value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "endDate must be on or after startDate",
      });
    }
  });

export type CreateSubscriptionBody = z.infer<typeof CreateSubscriptionBodySchema>;

export const UpdateSubscriptionBodySchema = z
  .object({
    services: servicesSchema.optional(),
    frequency: SubscriptionFrequencySchema.optional(),
    rate: z.number().nonnegative().optional(),
    rateIncludesVat: z.boolean().optional(),
    startDate: dateString.optional(),
    endDate: dateString.nullable().optional(),
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    const keys = Object.keys(value).filter(
      (k) => value[k as keyof typeof value] !== undefined,
    );
    if (keys.length === 0) {
      ctx.addIssue({ code: "custom", message: "At least one field is required" });
    }
    if (
      value.startDate !== undefined &&
      value.endDate !== undefined &&
      value.endDate !== null &&
      value.endDate < value.startDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "endDate must be on or after startDate",
      });
    }
  });

export type UpdateSubscriptionBody = z.infer<typeof UpdateSubscriptionBodySchema>;

export const SubscriptionOverlapDetailsSchema = z.object({
  conflictingSubscriptionId: z.uuid(),
});

export type SubscriptionOverlapDetails = z.infer<
  typeof SubscriptionOverlapDetailsSchema
>;
