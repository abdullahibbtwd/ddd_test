import { z } from "zod";
import { InvoiceStatus } from "./invoice-status";
import { MeasurementUnitSchema } from "./measurement-unit";
import { MonitoringPointStatusSchema } from "./monitoring-point-status";
import { MonitoringPointTypeSchema } from "./monitoring-point-type";
import { PageQuerySchema } from "./page-query";
import { ProductFormulationSchema } from "./product-formulation";

const optionalTrimmed = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const dosageString = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "Invalid dosage")
  .superRefine((value, ctx) => {
    const n = Number(value);
    if (!Number.isFinite(n) || !(n > 0)) {
      ctx.addIssue({ code: "custom", message: "Dosage must be greater than 0" });
    }
  });

const quantityString = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "Invalid quantity")
  .superRefine((value, ctx) => {
    const n = Number(value);
    if (!Number.isFinite(n) || !(n > 0)) {
      ctx.addIssue({ code: "custom", message: "Quantity must be greater than 0" });
    }
  });

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

/** True when visit child rows (products / point checks) may be edited. */
export function canEditVisitChildren(
  _visit: { id: string } | null | undefined,
  linkedInvoiceStatus: string | null | undefined,
): boolean {
  if (linkedInvoiceStatus == null) return true;
  return linkedInvoiceStatus === InvoiceStatus.DRAFT;
}

export type MonitoringPointRow = {
  id: string;
  label: string;
  active: boolean;
};

export type ReconcileMonitoringPointResult = {
  toCreate: Array<{ label: string }>;
  toDeactivate: string[];
  unchanged: string[];
};

/**
 * Deterministic reconcile of active monitoring points to a target count.
 * Active rows are ordered by label; extras deactivate; gaps create "Точка N".
 */
export function reconcileMonitoringPointCount(
  currentRows: MonitoringPointRow[],
  targetCount: number,
): ReconcileMonitoringPointResult {
  if (!Number.isInteger(targetCount) || targetCount < 0) {
    throw new Error("targetCount must be a non-negative integer");
  }

  const active = currentRows
    .filter((row) => row.active)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label, "bg"));

  if (targetCount === active.length) {
    return {
      toCreate: [],
      toDeactivate: [],
      unchanged: active.map((row) => row.id),
    };
  }

  if (targetCount > active.length) {
    const existingLabels = new Set(currentRows.map((row) => row.label));
    const toCreate: Array<{ label: string }> = [];
    let n = 1;
    const need = targetCount - active.length;
    // Bound: worst case every integer label is taken; still terminate.
    while (toCreate.length < need && n < targetCount + currentRows.length + 1000) {
      const label = `Точка ${n}`;
      n += 1;
      if (existingLabels.has(label)) continue;
      existingLabels.add(label);
      toCreate.push({ label });
    }
    return {
      toCreate,
      toDeactivate: [],
      unchanged: active.map((row) => row.id),
    };
  }

  // target < active: deactivate the trailing labels (highest sort order first
  // means we keep the first targetCount by label order).
  const keep = active.slice(0, targetCount);
  const drop = active.slice(targetCount);
  return {
    toCreate: [],
    toDeactivate: drop.map((row) => row.id),
    unchanged: keep.map((row) => row.id),
  };
}

export type ReportProductLike = {
  name: string;
  activeSubstances: string[];
  recommendations?: string | null;
};

/**
 * De-dupes active substances across products, preserving first-seen order.
 * Returns the full array; the PDF decides display width.
 */
export function groupActiveSubstancesForReport(
  products: ReportProductLike[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const product of products) {
    for (const substance of product.activeSubstances) {
      const key = substance.trim();
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/**
 * De-dupes recommendation strings across products, preserving first-seen order.
 */
export function groupRecommendationsForReport(
  products: ReportProductLike[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const product of products) {
    const text = product.recommendations?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

export const ProductListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().min(1).optional(),
  archived: z
    .enum(["true", "false", "all"])
    .optional()
    .default("false"),
});

export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;

export const ProductCreateBodySchema = z.object({
  name: z.string().trim().min(2).max(200),
  activeSubstances: z.array(z.string().trim().min(1).max(200)).default([]),
  formulation: ProductFormulationSchema,
  permitNumber: optionalTrimmed,
  permitHolder: optionalTrimmed,
  antidote: optionalTrimmed,
  ventilationPeriod: optionalTrimmed,
  exposurePeriod: optionalTrimmed,
  recommendations: optionalTrimmed,
  defaultDosage: dosageString.nullable().optional(),
  defaultUnit: MeasurementUnitSchema.nullable().optional(),
});

export type ProductCreateBody = z.infer<typeof ProductCreateBodySchema>;

export const ProductUpdateBodySchema = ProductCreateBodySchema.partial().extend({
  archived: z.boolean().optional(),
});

export type ProductUpdateBody = z.infer<typeof ProductUpdateBodySchema>;

export const ProductItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  activeSubstances: z.array(z.string()),
  formulation: ProductFormulationSchema,
  permitNumber: z.string().nullable(),
  permitHolder: z.string().nullable(),
  antidote: z.string().nullable(),
  ventilationPeriod: z.string().nullable(),
  exposurePeriod: z.string().nullable(),
  recommendations: z.string().nullable(),
  defaultDosage: z.string().nullable(),
  defaultUnit: MeasurementUnitSchema.nullable(),
  archived: z.boolean(),
  createdById: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProductItem = z.infer<typeof ProductItemSchema>;

export const ProductPageSchema = z.object({
  items: z.array(ProductItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type ProductPage = z.infer<typeof ProductPageSchema>;

export const VisitProductCreateBodySchema = z.object({
  productId: z.string().uuid(),
  quantity: quantityString,
  unit: MeasurementUnitSchema,
  notes: optionalTrimmed,
});

export type VisitProductCreateBody = z.infer<typeof VisitProductCreateBodySchema>;

export const VisitProductUpdateBodySchema = z.object({
  quantity: quantityString.optional(),
  unit: MeasurementUnitSchema.optional(),
  notes: optionalTrimmed,
});

export type VisitProductUpdateBody = z.infer<typeof VisitProductUpdateBodySchema>;

export const VisitProductItemSchema = z.object({
  id: z.string().uuid(),
  visitId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  productArchived: z.boolean(),
  quantity: z.string(),
  unit: MeasurementUnitSchema,
  notes: z.string().nullable(),
  frozen: z.boolean(),
  createdById: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type VisitProductItem = z.infer<typeof VisitProductItemSchema>;

export const VisitProductListSchema = z.object({
  items: z.array(VisitProductItemSchema),
  frozen: z.boolean(),
});

export type VisitProductList = z.infer<typeof VisitProductListSchema>;

export const MonitoringPointCreateBodySchema = z.object({
  label: z.string().trim().min(1).max(100),
  location: optionalTrimmed,
  type: MonitoringPointTypeSchema,
});

export type MonitoringPointCreateBody = z.infer<
  typeof MonitoringPointCreateBodySchema
>;

export const MonitoringPointUpdateBodySchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  location: optionalTrimmed,
  type: MonitoringPointTypeSchema.optional(),
  active: z.boolean().optional(),
});

export type MonitoringPointUpdateBody = z.infer<
  typeof MonitoringPointUpdateBodySchema
>;

export const MonitoringPointReconcileBodySchema = z.object({
  targetCount: z.number().int().min(0).max(500),
});

export type MonitoringPointReconcileBody = z.infer<
  typeof MonitoringPointReconcileBodySchema
>;

export const MonitoringPointLatestCheckSchema = z
  .object({
    id: z.string().uuid(),
    visitId: z.string().uuid(),
    checkedAt: dateString,
    status: MonitoringPointStatusSchema,
    notes: z.string().nullable(),
  })
  .nullable();

export const MonitoringPointItemSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  label: z.string(),
  location: z.string().nullable(),
  type: MonitoringPointTypeSchema,
  active: z.boolean(),
  latestCheck: MonitoringPointLatestCheckSchema.optional(),
  createdById: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MonitoringPointItem = z.infer<typeof MonitoringPointItemSchema>;

export const MonitoringPointListQuerySchema = PageQuerySchema.extend({
  withLatestCheck: z
    .union([z.literal("0"), z.literal("1"), z.literal(0), z.literal(1), z.boolean()])
    .optional()
    .transform((value) => value === true || value === 1 || value === "1"),
  active: z.enum(["true", "false", "all"]).optional().default("all"),
});

export type MonitoringPointListQuery = z.infer<
  typeof MonitoringPointListQuerySchema
>;

export const MonitoringPointPageSchema = z.object({
  items: z.array(MonitoringPointItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type MonitoringPointPage = z.infer<typeof MonitoringPointPageSchema>;

export const MonitoringPointReconcileResultSchema = z.object({
  created: z.array(MonitoringPointItemSchema),
  deactivated: z.array(MonitoringPointItemSchema),
  targetCount: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
});

export type MonitoringPointReconcileResult = z.infer<
  typeof MonitoringPointReconcileResultSchema
>;

export const MonitoringPointCheckCreateBodySchema = z.object({
  pointId: z.string().uuid(),
  status: MonitoringPointStatusSchema,
  notes: optionalTrimmed,
  checkedAt: dateString.optional(),
});

export type MonitoringPointCheckCreateBody = z.infer<
  typeof MonitoringPointCheckCreateBodySchema
>;

export const MonitoringPointCheckUpdateBodySchema = z.object({
  status: MonitoringPointStatusSchema.optional(),
  notes: optionalTrimmed,
  checkedAt: dateString.optional(),
});

export type MonitoringPointCheckUpdateBody = z.infer<
  typeof MonitoringPointCheckUpdateBodySchema
>;

export const MonitoringPointCheckBatchBodySchema = z.object({
  checks: z
    .array(
      z.object({
        pointId: z.string().uuid(),
        status: MonitoringPointStatusSchema,
        notes: optionalTrimmed,
      }),
    )
    .min(1)
    .max(200),
});

export type MonitoringPointCheckBatchBody = z.infer<
  typeof MonitoringPointCheckBatchBodySchema
>;

export const MonitoringPointCheckItemSchema = z.object({
  id: z.string().uuid(),
  pointId: z.string().uuid(),
  pointLabel: z.string(),
  pointType: MonitoringPointTypeSchema,
  visitId: z.string().uuid(),
  checkedAt: dateString,
  status: MonitoringPointStatusSchema,
  notes: z.string().nullable(),
  photoFileId: z.string().uuid().nullable(),
  frozen: z.boolean(),
  createdById: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MonitoringPointCheckItem = z.infer<
  typeof MonitoringPointCheckItemSchema
>;

export const MonitoringPointCheckListSchema = z.object({
  items: z.array(MonitoringPointCheckItemSchema),
  frozen: z.boolean(),
});

export type MonitoringPointCheckList = z.infer<
  typeof MonitoringPointCheckListSchema
>;

/** Snapshot shape stored in visits.visit_products_snapshot (JSONB). */
export const VisitProductSnapshotEntrySchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  activeSubstances: z.array(z.string()),
  formulation: ProductFormulationSchema,
  permitNumber: z.string().nullable(),
  antidote: z.string().nullable(),
  ventilationPeriod: z.string().nullable(),
  exposurePeriod: z.string().nullable(),
  recommendations: z.string().nullable(),
  quantity: z.string(),
  unit: MeasurementUnitSchema,
  notes: z.string().nullable(),
});

export type VisitProductSnapshotEntry = z.infer<
  typeof VisitProductSnapshotEntrySchema
>;

export const ServiceReportQuerySchema = z.object({
  copy: z
    .union([z.literal("0"), z.literal("1"), z.literal(0), z.literal(1)])
    .optional()
    .default("0")
    .transform((value) => value === 1 || value === "1"),
});

export type ServiceReportQuery = z.infer<typeof ServiceReportQuerySchema>;
