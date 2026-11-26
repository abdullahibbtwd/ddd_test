import { z } from "zod";
import { addMonths, monthOf } from "./dates";
import { roundHalfUp } from "./money";
import { PageQuerySchema } from "./page-query";
import { agingBuckets, AgingBucketSchema } from "./payments";
import { ScheduleStatusSchema } from "./schedule-status";

const QUANTITY_SCALE = 3;

function addQuantity(a: string, b: string): string {
  const parse = (value: string): bigint => {
    const n = roundHalfUp(value, QUANTITY_SCALE);
    const neg = n.startsWith("-");
    const raw = neg ? n.slice(1) : n;
    const [w, f = ""] = raw.split(".");
    const digits = BigInt(w + f.padEnd(QUANTITY_SCALE, "0").slice(0, QUANTITY_SCALE));
    return neg ? -digits : digits;
  };
  const sum = parse(a) + parse(b);
  const neg = sum < 0n;
  const abs = neg ? -sum : sum;
  const s = abs.toString().padStart(QUANTITY_SCALE + 1, "0");
  const body = `${s.slice(0, -QUANTITY_SCALE)}.${s.slice(-QUANTITY_SCALE)}`;
  return neg ? `-${body}` : body;
}

/** Safety cap for streamed exports (first-pass count). */
export const REPORT_EXPORT_ROW_CAP = 200_000;

export const ReportKind = {
  REVENUE: "REVENUE",
  SERVICE_COVERAGE: "SERVICE_COVERAGE",
  OUTSTANDING: "OUTSTANDING",
  CASH: "CASH",
  EXPIRATIONS: "EXPIRATIONS",
  PRODUCTS: "PRODUCTS",
} as const;

export const ReportKindSchema = z.enum([
  ReportKind.REVENUE,
  ReportKind.SERVICE_COVERAGE,
  ReportKind.OUTSTANDING,
  ReportKind.CASH,
  ReportKind.EXPIRATIONS,
  ReportKind.PRODUCTS,
]);

export type ReportKind = z.infer<typeof ReportKindSchema>;

export const ReportExportFormat = {
  EXCEL: "EXCEL",
  PDF: "PDF",
} as const;

export const ReportExportFormatSchema = z.enum([
  ReportExportFormat.EXCEL,
  ReportExportFormat.PDF,
]);

export type ReportExportFormat = z.infer<typeof ReportExportFormatSchema>;

export const RevenueGrouping = {
  CLIENT: "CLIENT",
  SITE: "SITE",
  AREA: "AREA",
  EMPLOYEE: "EMPLOYEE",
  SERVICE: "SERVICE",
  PERIOD: "PERIOD",
} as const;

export const RevenueGroupingSchema = z.enum([
  RevenueGrouping.CLIENT,
  RevenueGrouping.SITE,
  RevenueGrouping.AREA,
  RevenueGrouping.EMPLOYEE,
  RevenueGrouping.SERVICE,
  RevenueGrouping.PERIOD,
]);

export type RevenueGrouping = z.infer<typeof RevenueGroupingSchema>;

export const ExpirationKind = {
  CERTIFICATE: "CERTIFICATE",
  AGREEMENT: "AGREEMENT",
  FOOD: "FOOD",
} as const;

export const ExpirationKindSchema = z.enum([
  ExpirationKind.CERTIFICATE,
  ExpirationKind.AGREEMENT,
  ExpirationKind.FOOD,
]);

export type ExpirationKind = z.infer<typeof ExpirationKindSchema>;

const IsoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

export const commonFilterSchema = z
  .object({
    from: IsoDateString.optional(),
    to: IsoDateString.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.from && v.to && v.from > v.to) {
      ctx.addIssue({
        code: "custom",
        message: "from must be <= to",
        path: ["from"],
      });
    }
  });

export type CommonFilter = z.infer<typeof commonFilterSchema>;

const uuidOpt = z.uuid().optional();

/** Alias — reuse P8 agingBuckets; do not duplicate. */
export function agingBucketFromDueDate(dueDate: string, asOf: string) {
  return agingBuckets(dueDate, asOf);
}

/**
 * Inclusive list of YYYY-MM months between two YYYY-MM-DD dates.
 */
export function monthRange(from: string, to: string): string[] {
  if (from > to) return [];
  const start = monthOf(from);
  const end = monthOf(to);
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

export type RevenueGroupingInput = {
  clientId: string | null;
  siteId: string | null;
  areaId: string | null;
  employeeId: string | null;
  serviceKey: string | null;
  periodMonth: string | null;
};

/** Deterministic aggregation key for Revenue grouping toggle. */
export function groupingKey(
  row: RevenueGroupingInput,
  mode: RevenueGrouping,
): string {
  switch (mode) {
    case RevenueGrouping.CLIENT:
      return `client:${row.clientId ?? ""}`;
    case RevenueGrouping.SITE:
      return `site:${row.siteId ?? ""}`;
    case RevenueGrouping.AREA:
      return `area:${row.areaId ?? ""}`;
    case RevenueGrouping.EMPLOYEE:
      return `employee:${row.employeeId ?? ""}`;
    case RevenueGrouping.SERVICE:
      return `service:${row.serviceKey ?? ""}`;
    case RevenueGrouping.PERIOD:
      return `period:${row.periodMonth ?? ""}`;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/**
 * Sum quantities per unit. Units never mix — each unit is its own total.
 * Quantities use 3 decimal places (same scale as invoice quantity helpers).
 */
export function quantityByUnit(
  rows: Array<{ quantity: string | number; unit: string }>,
): Record<string, string> {
  const acc: Record<string, string> = {};
  for (const row of rows) {
    const q =
      typeof row.quantity === "number"
        ? roundHalfUp(String(row.quantity), QUANTITY_SCALE)
        : roundHalfUp(row.quantity, QUANTITY_SCALE);
    const prev = acc[row.unit] ?? "0.000";
    acc[row.unit] = addQuantity(prev, q);
  }
  return acc;
}

function refineFromTo<T extends { from?: string; to?: string }>(
  v: T,
  ctx: z.RefinementCtx,
): void {
  if (v.from && v.to && v.from > v.to) {
    ctx.addIssue({
      code: "custom",
      message: "from must be <= to",
      path: ["from"],
    });
  }
}

export const reportFilterRevenue = commonFilterSchema.and(
  z.object({
    areaId: uuidOpt,
    employeeId: uuidOpt,
    clientId: uuidOpt,
    siteId: uuidOpt,
    groupBy: RevenueGroupingSchema.optional(),
  }),
);

export const ReportRevenueQuerySchema = PageQuerySchema.extend({
  from: IsoDateString.optional(),
  to: IsoDateString.optional(),
  areaId: uuidOpt,
  employeeId: uuidOpt,
  clientId: uuidOpt,
  siteId: uuidOpt,
  groupBy: RevenueGroupingSchema.optional(),
}).superRefine(refineFromTo);

export const ReportRevenueExportQuerySchema = z
  .object({
    from: IsoDateString.optional(),
    to: IsoDateString.optional(),
    areaId: uuidOpt,
    employeeId: uuidOpt,
    clientId: uuidOpt,
    siteId: uuidOpt,
    groupBy: RevenueGroupingSchema.optional(),
    format: ReportExportFormatSchema,
  })
  .superRefine(refineFromTo);

export type ReportRevenueQuery = z.infer<typeof ReportRevenueQuerySchema>;
export type ReportRevenueExportQuery = z.infer<
  typeof ReportRevenueExportQuerySchema
>;

export const reportFilterServiceCoverage = commonFilterSchema.and(
  z.object({ areaId: uuidOpt }),
);

export const ReportServiceCoverageQuerySchema = PageQuerySchema.extend({
  from: IsoDateString.optional(),
  to: IsoDateString.optional(),
  areaId: uuidOpt,
}).superRefine(refineFromTo);

export const ReportServiceCoverageExportQuerySchema = z
  .object({
    from: IsoDateString.optional(),
    to: IsoDateString.optional(),
    areaId: uuidOpt,
    format: ReportExportFormatSchema,
  })
  .superRefine(refineFromTo);

export type ReportServiceCoverageQuery = z.infer<
  typeof ReportServiceCoverageQuerySchema
>;
export type ReportServiceCoverageExportQuery = z.infer<
  typeof ReportServiceCoverageExportQuerySchema
>;

export const reportFilterOutstanding = commonFilterSchema.and(
  z.object({
    clientId: uuidOpt,
    areaId: uuidOpt,
    asOf: IsoDateString.optional(),
  }),
);

export const ReportOutstandingQuerySchema = PageQuerySchema.extend({
  from: IsoDateString.optional(),
  to: IsoDateString.optional(),
  clientId: uuidOpt,
  areaId: uuidOpt,
  asOf: IsoDateString.optional(),
}).superRefine(refineFromTo);

export const ReportOutstandingExportQuerySchema = z
  .object({
    from: IsoDateString.optional(),
    to: IsoDateString.optional(),
    clientId: uuidOpt,
    areaId: uuidOpt,
    asOf: IsoDateString.optional(),
    format: ReportExportFormatSchema,
  })
  .superRefine(refineFromTo);

export type ReportOutstandingQuery = z.infer<typeof ReportOutstandingQuerySchema>;
export type ReportOutstandingExportQuery = z.infer<
  typeof ReportOutstandingExportQuerySchema
>;

export const reportFilterCash = commonFilterSchema.and(
  z.object({ employeeId: uuidOpt }),
);

export const ReportCashQuerySchema = PageQuerySchema.extend({
  from: IsoDateString.optional(),
  to: IsoDateString.optional(),
  employeeId: uuidOpt,
}).superRefine(refineFromTo);

export const ReportCashExportQuerySchema = z
  .object({
    from: IsoDateString.optional(),
    to: IsoDateString.optional(),
    employeeId: uuidOpt,
    format: ReportExportFormatSchema,
  })
  .superRefine(refineFromTo);

export type ReportCashQuery = z.infer<typeof ReportCashQuerySchema>;
export type ReportCashExportQuery = z.infer<typeof ReportCashExportQuerySchema>;

const commaSeparatedKinds = z
  .union([
    z.array(ExpirationKindSchema),
    ExpirationKindSchema.transform((v) => [v]),
    z
      .string()
      .transform((s) =>
        s
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      )
      .pipe(z.array(ExpirationKindSchema)),
  ])
  .optional();

export const reportFilterExpirations = commonFilterSchema.and(
  z.object({
    areaId: uuidOpt,
    kinds: z.array(ExpirationKindSchema).optional(),
  }),
);

export const ReportExpirationsQuerySchema = PageQuerySchema.extend({
  from: IsoDateString.optional(),
  to: IsoDateString.optional(),
  areaId: uuidOpt,
  kinds: commaSeparatedKinds,
}).superRefine(refineFromTo);

export const ReportExpirationsExportQuerySchema = z
  .object({
    from: IsoDateString.optional(),
    to: IsoDateString.optional(),
    areaId: uuidOpt,
    kinds: commaSeparatedKinds,
    format: ReportExportFormatSchema,
  })
  .superRefine(refineFromTo);

export type ReportExpirationsQuery = z.infer<typeof ReportExpirationsQuerySchema>;
export type ReportExpirationsExportQuery = z.infer<
  typeof ReportExpirationsExportQuerySchema
>;

const commaSeparatedUuids = z
  .union([
    z.array(z.uuid()),
    z.uuid().transform((v) => [v]),
    z
      .string()
      .transform((s) =>
        s
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.uuid())),
  ])
  .optional();

export const reportFilterProducts = commonFilterSchema.and(
  z.object({
    productIds: z.array(z.uuid()).optional(),
    siteId: uuidOpt,
  }),
);

export const ReportProductsQuerySchema = PageQuerySchema.extend({
  from: IsoDateString.optional(),
  to: IsoDateString.optional(),
  productIds: commaSeparatedUuids,
  siteId: uuidOpt,
}).superRefine(refineFromTo);

export const ReportProductsExportQuerySchema = z
  .object({
    from: IsoDateString.optional(),
    to: IsoDateString.optional(),
    productIds: commaSeparatedUuids,
    siteId: uuidOpt,
    format: ReportExportFormatSchema,
  })
  .superRefine(refineFromTo);

export type ReportProductsQuery = z.infer<typeof ReportProductsQuerySchema>;
export type ReportProductsExportQuery = z.infer<
  typeof ReportProductsExportQuerySchema
>;

/** Money string (2 dp) used in report payloads. */
const moneyString = z.string();

export const ReportRevenueRowSchema = z.object({
  documentId: z.uuid(),
  documentType: z.string(),
  number: z.string().nullable(),
  issuedAt: IsoDateString.nullable(),
  clientId: z.uuid().nullable(),
  clientName: z.string().nullable(),
  clientLegalName: z.string().nullable(),
  clientEik: z.string().nullable(),
  siteId: z.uuid().nullable(),
  siteName: z.string().nullable(),
  areaId: z.uuid().nullable(),
  areaName: z.string().nullable(),
  employeeId: z.uuid().nullable(),
  employeeName: z.string().nullable(),
  serviceKey: z.string().nullable(),
  periodMonth: z.string().nullable(),
  groupKey: z.string().optional(),
  groupLabel: z.string().optional(),
  netAmount: moneyString,
  vatAmount: moneyString,
  grossAmount: moneyString,
});

export type ReportRevenueRow = z.infer<typeof ReportRevenueRowSchema>;

export const ReportRevenueTotalsSchema = z.object({
  netAmount: moneyString,
  vatAmount: moneyString,
  grossAmount: moneyString,
});

export const ReportRevenuePageSchema = z.object({
  items: z.array(ReportRevenueRowSchema),
  totals: ReportRevenueTotalsSchema,
  filter: reportFilterRevenue,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type ReportRevenuePage = z.infer<typeof ReportRevenuePageSchema>;

export const ReportServiceCoverageRowSchema = z.object({
  siteId: z.uuid(),
  siteName: z.string(),
  areaId: z.uuid().nullable(),
  areaName: z.string().nullable(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  status: ScheduleStatusSchema,
});

export type ReportServiceCoverageRow = z.infer<
  typeof ReportServiceCoverageRowSchema
>;

export const ReportServiceCoverageTotalsSchema = z.object({
  SERVICED: z.number().int().nonnegative(),
  OVERDUE: z.number().int().nonnegative(),
  UPCOMING: z.number().int().nonnegative(),
  NOT_DUE: z.number().int().nonnegative(),
  NOT_STARTED: z.number().int().nonnegative(),
  ENDED: z.number().int().nonnegative(),
  ON_DEMAND: z.number().int().nonnegative(),
});

export const ReportServiceCoveragePageSchema = z.object({
  items: z.array(ReportServiceCoverageRowSchema),
  totals: ReportServiceCoverageTotalsSchema,
  filter: reportFilterServiceCoverage,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type ReportServiceCoveragePage = z.infer<
  typeof ReportServiceCoveragePageSchema
>;

export const ReportOutstandingRowSchema = z.object({
  invoiceId: z.uuid(),
  number: z.string(),
  clientId: z.uuid(),
  clientName: z.string(),
  clientLegalName: z.string().nullable(),
  clientEik: z.string().nullable(),
  dueDate: IsoDateString,
  grossAmount: moneyString,
  paidSum: moneyString,
  outstanding: moneyString,
  agingBucket: AgingBucketSchema.nullable(),
});

export type ReportOutstandingRow = z.infer<typeof ReportOutstandingRowSchema>;

export const ReportOutstandingTotalsSchema = z.object({
  outstanding: moneyString,
  "0_30": moneyString,
  "31_60": moneyString,
  "61_90": moneyString,
  "90_plus": moneyString,
});

export const ReportOutstandingPageSchema = z.object({
  items: z.array(ReportOutstandingRowSchema),
  totals: ReportOutstandingTotalsSchema,
  filter: reportFilterOutstanding,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type ReportOutstandingPage = z.infer<typeof ReportOutstandingPageSchema>;

export const ReportCashRowSchema = z.object({
  employeeId: z.uuid(),
  employeeName: z.string(),
  date: IsoDateString,
  collected: moneyString,
  handedOver: moneyString,
  net: moneyString,
});

export type ReportCashRow = z.infer<typeof ReportCashRowSchema>;

export const ReportCashTotalsSchema = z.object({
  collected: moneyString,
  handedOver: moneyString,
  net: moneyString,
  byEmployee: z.array(
    z.object({
      employeeId: z.uuid(),
      employeeName: z.string(),
      collected: moneyString,
      handedOver: moneyString,
      net: moneyString,
    }),
  ),
});

export const ReportCashPageSchema = z.object({
  items: z.array(ReportCashRowSchema),
  totals: ReportCashTotalsSchema,
  filter: reportFilterCash,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type ReportCashPage = z.infer<typeof ReportCashPageSchema>;

export const ReportExpirationRowSchema = z.object({
  kind: ExpirationKindSchema,
  entityId: z.uuid(),
  subject: z.string(),
  siteId: z.uuid().nullable(),
  siteName: z.string().nullable(),
  dueDate: IsoDateString,
  status: z.string(),
});

export type ReportExpirationRow = z.infer<typeof ReportExpirationRowSchema>;

export const ReportExpirationsTotalsSchema = z.object({
  CERTIFICATE: z.number().int().nonnegative(),
  AGREEMENT: z.number().int().nonnegative(),
  FOOD: z.number().int().nonnegative(),
});

export const ReportExpirationsPageSchema = z.object({
  items: z.array(ReportExpirationRowSchema),
  totals: ReportExpirationsTotalsSchema,
  filter: reportFilterExpirations,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type ReportExpirationsPage = z.infer<typeof ReportExpirationsPageSchema>;

export const ReportProductsRowSchema = z.object({
  productId: z.uuid(),
  productName: z.string(),
  activeSubstances: z.string().nullable(),
  unit: z.string(),
  totalQuantity: moneyString,
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

export type ReportProductsRow = z.infer<typeof ReportProductsRowSchema>;

export const ReportProductsTotalsSchema = z.object({
  byUnit: z.record(z.string(), moneyString),
});

export const ReportProductsPageSchema = z.object({
  items: z.array(ReportProductsRowSchema),
  totals: ReportProductsTotalsSchema,
  filter: reportFilterProducts,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type ReportProductsPage = z.infer<typeof ReportProductsPageSchema>;
