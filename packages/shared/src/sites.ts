import { z } from "zod";
import { ClientKindSchema } from "./clients";
import { ErrorCode } from "./errors";
import { PageQuerySchema } from "./page-query";
import { ServiceTypeSchema } from "./service-type";
import { SiteStatus, SiteStatusSchema } from "./site-status";
import { SubscriptionCurrentSummarySchema } from "./subscriptions";
import { validateEik } from "./eik";

export { SiteStatus, SiteStatusSchema };
export type { SiteStatus as SiteStatusType } from "./site-status";

/** Display name: trim and collapse repeated spaces. */
export function collapseSiteDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

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

const optionalEikSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .refine((value) => value == null || validateEik(value), {
    message: ErrorCode.INVALID_EIK,
  });

const optionalEmailSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value.toLowerCase()))
  .nullable()
  .optional()
  .refine((value) => value == null || z.email().safeParse(value).success, {
    message: "Invalid email",
  });

export const SiteTypeItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SiteTypeItem = z.infer<typeof SiteTypeItemSchema>;

export const SiteTypeListQuerySchema = z.object({
  includeInactive: booleanQuery,
});

export type SiteTypeListQuery = z.infer<typeof SiteTypeListQuerySchema>;

export const SiteTypeListResponseSchema = z.object({
  items: z.array(SiteTypeItemSchema),
});

export type SiteTypeListResponse = z.infer<typeof SiteTypeListResponseSchema>;

export const CreateSiteTypeBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .transform((value) => collapseSiteDisplayName(value))
    .refine((value) => value.length > 0, { message: "Name is required" }),
});

export type CreateSiteTypeBody = z.infer<typeof CreateSiteTypeBodySchema>;

export const UpdateSiteTypeBodySchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(120)
      .transform((value) => collapseSiteDisplayName(value))
      .refine((value) => value.length > 0, { message: "Name is required" })
      .optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.name === undefined && value.isActive === undefined) {
      ctx.addIssue({ code: "custom", message: "At least one field is required" });
    }
  });

export type UpdateSiteTypeBody = z.infer<typeof UpdateSiteTypeBodySchema>;

export const SiteListQuerySchema = PageQuerySchema.extend({
  areaId: z.uuid().optional(),
  siteTypeId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  /** When false, only sites with no subscription covering Sofia today. */
  hasSubscription: booleanQuery,
  status: z
    .union([SiteStatusSchema, z.literal("ALL")])
    .optional()
    .transform((value) => value ?? SiteStatus.ACTIVE),
  sort: z
    .enum(["name", "-name", "created_at", "-created_at", "createdAt", "-createdAt"])
    .optional(),
});

export type SiteListQuery = z.infer<typeof SiteListQuerySchema>;

export const SiteMapQuerySchema = z.object({
  search: z.string().optional(),
  areaId: z.uuid().optional(),
  siteTypeId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  status: z
    .union([SiteStatusSchema, z.literal("ALL")])
    .optional()
    .transform((value) => value ?? SiteStatus.ACTIVE),
});

export type SiteMapQuery = z.infer<typeof SiteMapQuerySchema>;

export const SiteRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const SiteClientSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  eik: z.string().nullable(),
  phone: z.string().nullable(),
});

export type SiteClientSummary = z.infer<typeof SiteClientSummarySchema>;

export const SiteListItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string(),
  status: SiteStatusSchema,
  area: SiteRefSchema,
  type: SiteRefSchema,
  client: SiteRefSchema,
  monitoringPointsCount: z.number().int().nonnegative(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export type SiteListItem = z.infer<typeof SiteListItemSchema>;

export const SitePageSchema = z.object({
  items: z.array(SiteListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type SitePage = z.infer<typeof SitePageSchema>;

export const SiteMapItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  clientName: z.string(),
});

export type SiteMapItem = z.infer<typeof SiteMapItemSchema>;

export const SiteMapResponseSchema = z.object({
  items: z.array(SiteMapItemSchema),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export type SiteMapResponse = z.infer<typeof SiteMapResponseSchema>;

export const SiteLastVisitSummarySchema = z.object({
  id: z.uuid(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  treatmentType: ServiceTypeSchema,
  chargedAmount: z.number().nonnegative(),
  rateIncludesVat: z.boolean(),
});

export type SiteLastVisitSummary = z.infer<typeof SiteLastVisitSummarySchema>;

export const SiteItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string(),
  status: SiteStatusSchema,
  area: SiteRefSchema,
  type: SiteRefSchema,
  client: SiteClientSummarySchema,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  contactPerson: z.string().nullable(),
  contactPhone: z.string().nullable(),
  floorAreaM2: z.number().nullable(),
  monitoringPointsCount: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  terminatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  currentSubscription: SubscriptionCurrentSummarySchema.nullable(),
  lastVisitAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  lastVisitSummary: SiteLastVisitSummarySchema.nullable(),
});

export type SiteItem = z.infer<typeof SiteItemSchema>;

export const SiteDuplicatesQuerySchema = z.object({
  clientId: z.uuid(),
  address: z.string().min(1),
  excludeId: z.uuid().optional(),
});

export type SiteDuplicatesQuery = z.infer<typeof SiteDuplicatesQuerySchema>;

export const SiteDuplicateCandidateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string(),
  score: z.number(),
});

export type SiteDuplicateCandidate = z.infer<typeof SiteDuplicateCandidateSchema>;

export const SiteDuplicatesResponseSchema = z.object({
  items: z.array(SiteDuplicateCandidateSchema).max(5),
});

export type SiteDuplicatesResponse = z.infer<typeof SiteDuplicatesResponseSchema>;

/** Quick-add client payload (first site create). */
export const QuickAddClientSchema = z
  .object({
    kind: ClientKindSchema,
    name: z
      .string()
      .min(1)
      .max(300)
      .transform((value) => collapseSiteDisplayName(value))
      .refine((value) => value.length > 0, { message: "Name is required" }),
    eik: optionalEikSchema,
    phone: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    email: optionalEmailSchema,
  })
  .superRefine((value, ctx) => {
    if (value.kind === "COMPANY" && value.eik == null) {
      ctx.addIssue({
        code: "custom",
        path: ["eik"],
        message: ErrorCode.INVALID_EIK,
      });
    }
  });

export type QuickAddClient = z.infer<typeof QuickAddClientSchema>;

const CreateSiteFieldsSchema = z
  .object({
    clientId: z.uuid().optional(),
    newClient: QuickAddClientSchema.optional(),
    areaId: z.uuid(),
    siteTypeId: z.uuid(),
    name: z
      .string()
      .min(1)
      .max(300)
      .transform((value) => collapseSiteDisplayName(value))
      .refine((value) => value.length > 0, { message: "Name is required" }),
    address: z
      .string()
      .min(1)
      .max(500)
      .transform((value) => collapseSiteDisplayName(value))
      .refine((value) => value.length > 0, { message: "Address is required" }),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    contactPerson: optionalText(200),
    contactPhone: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    // Use min(0.01) instead of positive()/gt(0) so OpenAPI 3.0 gets `minimum`
    // (boolean exclusiveMinimum breaks Orval validation).
    floorAreaM2: z.number().min(0.01).nullable().optional(),
    monitoringPointsCount: z.number().int().nonnegative().optional(),
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    const latSet = value.latitude !== undefined && value.latitude !== null;
    const lngSet = value.longitude !== undefined && value.longitude !== null;
    if (latSet !== lngSet) {
      ctx.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "latitude and longitude must both be set or both be null",
      });
    }
  });

export const CreateSiteBodySchema = CreateSiteFieldsSchema.superRefine((value, ctx) => {
  const hasClientId = value.clientId !== undefined;
  const hasNewClient = value.newClient !== undefined;
  if (hasClientId === hasNewClient) {
    ctx.addIssue({
      code: "custom",
      path: ["clientId"],
      message: "Exactly one of clientId or newClient is required",
    });
  }
});

export type CreateSiteBody = z.infer<typeof CreateSiteBodySchema>;

export const UpdateSiteBodySchema = z
  .object({
    areaId: z.uuid().optional(),
    siteTypeId: z.uuid().optional(),
    name: z
      .string()
      .min(1)
      .max(300)
      .transform((value) => collapseSiteDisplayName(value))
      .refine((value) => value.length > 0, { message: "Name is required" })
      .optional(),
    address: z
      .string()
      .min(1)
      .max(500)
      .transform((value) => collapseSiteDisplayName(value))
      .refine((value) => value.length > 0, { message: "Address is required" })
      .optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    contactPerson: optionalText(200),
    contactPhone: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
    floorAreaM2: z.number().min(0.01).nullable().optional(),
    monitoringPointsCount: z.number().int().nonnegative().optional(),
    notes: optionalText(2000),
    status: SiteStatusSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const keys = Object.keys(value).filter((k) => value[k as keyof typeof value] !== undefined);
    if (keys.length === 0) {
      ctx.addIssue({ code: "custom", message: "At least one field is required" });
    }
    if (value.latitude !== undefined || value.longitude !== undefined) {
      const latNull = value.latitude === null;
      const lngNull = value.longitude === null;
      const latMissing = value.latitude === undefined;
      const lngMissing = value.longitude === undefined;
      if (latMissing || lngMissing || latNull !== lngNull) {
        ctx.addIssue({
          code: "custom",
          path: ["latitude"],
          message: "latitude and longitude must both be set or both be null",
        });
      }
    }
  });

export type UpdateSiteBody = z.infer<typeof UpdateSiteBodySchema>;
