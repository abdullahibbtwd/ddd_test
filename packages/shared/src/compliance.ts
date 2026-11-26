import { z } from "zod";
import { AgreementStatus, AgreementStatusSchema } from "./agreement-status";
import { CertificateStatus, CertificateStatusSchema } from "./certificate-status";
import { addCalendarMonths } from "./dates";
import { FoodResultStatus, FoodResultStatusSchema } from "./food-result-status";
import { PageQuerySchema } from "./page-query";
import { ServiceTypeSchema } from "./service-type";
import { addCalendarDays } from "./visit-windows";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

const optionalNotes = z
  .string()
  .trim()
  .max(4000)
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const optionalJobTitle = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const moneyNonNegative = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Invalid money amount")
  .superRefine((value, ctx) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({
        code: "custom",
        message: "Amount must be greater than or equal to 0",
      });
    }
  });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value: string): void {
  if (!DATE_RE.test(value)) {
    throw new Error(`Invalid date string: ${value}`);
  }
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
}

/** Signed calendar-day difference: days from `from` to `to`. */
export function calendarDaysBetween(from: string, to: string): number {
  assertDate(from);
  assertDate(to);
  if (from === to) return 0;
  let days = 0;
  if (to > from) {
    let cursor = from;
    while (cursor < to) {
      cursor = addCalendarDays(cursor, 1);
      days += 1;
      if (days > 100_000) break;
    }
    return days;
  }
  let cursor = to;
  while (cursor < from) {
    cursor = addCalendarDays(cursor, 1);
    days += 1;
    if (days > 100_000) break;
  }
  return -days;
}

/**
 * Computed certificate status. Pure — caller supplies `asOf` (typically
 * `todayInSofia(now)` at the API call site).
 *
 * - EXPIRED when nextRenewalAt < asOf
 * - EXPIRING when nextRenewalAt − asOf ≤ 30 calendar days
 * - CURRENT otherwise
 */
export function certificateStatus(input: {
  nextRenewalAt: string;
  asOf: string;
}): CertificateStatus {
  assertDate(input.nextRenewalAt);
  assertDate(input.asOf);
  if (input.nextRenewalAt < input.asOf) {
    return CertificateStatus.EXPIRED;
  }
  const daysUntil = calendarDaysBetween(input.asOf, input.nextRenewalAt);
  if (daysUntil <= 30) {
    return CertificateStatus.EXPIRING;
  }
  return CertificateStatus.CURRENT;
}

/**
 * Combined agreement display status (D2).
 * Stored TERMINATED / RENEWED win (business decision).
 * Otherwise calendar expiry: expiresAt < asOf → EXPIRED; else ACTIVE.
 * Stored EXPIRED is preserved when the calendar also says expired.
 */
export function agreementStatus(input: {
  expiresAt: string;
  storedStatus: AgreementStatus;
  asOf: string;
}): AgreementStatus {
  assertDate(input.expiresAt);
  assertDate(input.asOf);
  AgreementStatusSchema.parse(input.storedStatus);

  if (input.storedStatus === AgreementStatus.TERMINATED) {
    return AgreementStatus.TERMINATED;
  }
  if (input.storedStatus === AgreementStatus.RENEWED) {
    return AgreementStatus.RENEWED;
  }
  if (input.expiresAt < input.asOf) {
    return AgreementStatus.EXPIRED;
  }
  if (input.storedStatus === AgreementStatus.EXPIRED) {
    // Stored expired but calendar says still valid — treat as ACTIVE for display.
    return AgreementStatus.ACTIVE;
  }
  return AgreementStatus.ACTIVE;
}

export type FoodScheduleDueResult = {
  due: boolean;
  /** nextDueAt advanced by cadenceMonths (for after a record is created). */
  nextDueAt: string;
};

/**
 * Food schedule due helper. Pure — takes `asOf`.
 * `due` when nextDueAt ≤ asOf. `nextDueAt` in the result is the advanced
 * date (current nextDueAt + cadenceMonths).
 */
export function foodScheduleDue(input: {
  nextDueAt: string;
  cadenceMonths: number;
  asOf: string;
}): FoodScheduleDueResult {
  assertDate(input.nextDueAt);
  assertDate(input.asOf);
  if (
    !Number.isInteger(input.cadenceMonths) ||
    input.cadenceMonths < 1 ||
    input.cadenceMonths > 24
  ) {
    throw new Error("cadenceMonths must be an integer between 1 and 24");
  }
  return {
    due: input.nextDueAt <= input.asOf,
    nextDueAt: addCalendarMonths(input.nextDueAt, input.cadenceMonths),
  };
}

/**
 * True when the target date is on or after `asOf` and within `days`
 * calendar days (inclusive). Used by certificates and agreements expiring queries.
 */
export function expiresWithin(input: {
  nextRenewalAt?: string;
  expiresAt?: string;
  asOf: string;
  days: number;
}): boolean {
  assertDate(input.asOf);
  if (!Number.isInteger(input.days) || input.days < 0) {
    throw new Error("days must be a non-negative integer");
  }
  const target = input.nextRenewalAt ?? input.expiresAt;
  if (target === undefined) {
    throw new Error("nextRenewalAt or expiresAt is required");
  }
  assertDate(target);
  if (target < input.asOf) return false;
  const limit = addCalendarDays(input.asOf, input.days);
  return target <= limit;
}

/** FIELD redaction: keep name, replace job title with '[скрито]'. */
export function redactPersonForField(input: {
  fullName: string;
  jobTitle: string | null;
}): { fullName: string; jobTitle: string } {
  void input.jobTitle;
  return {
    fullName: input.fullName,
    jobTitle: "[скрито]",
  };
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const ClientEmployeeCreateBodySchema = z.object({
  clientId: z.uuid(),
  fullName: z.string().trim().min(2).max(200),
  jobTitle: optionalJobTitle,
  siteId: z.uuid().nullable().optional(),
  notes: optionalNotes,
});

export type ClientEmployeeCreateBody = z.infer<
  typeof ClientEmployeeCreateBodySchema
>;

export const ClientEmployeeUpdateBodySchema = z.object({
  fullName: z.string().trim().min(2).max(200).optional(),
  jobTitle: optionalJobTitle,
  siteId: z.uuid().nullable().optional(),
  notes: optionalNotes,
});

export type ClientEmployeeUpdateBody = z.infer<
  typeof ClientEmployeeUpdateBodySchema
>;

export const ClientEmployeeListQuerySchema = PageQuerySchema.extend({
  clientId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  includeErased: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? false : v === "true")),
  status: CertificateStatusSchema.optional(),
  expiringWithin: z.coerce.number().int().min(0).max(365).optional(),
});

export type ClientEmployeeListQuery = z.infer<
  typeof ClientEmployeeListQuerySchema
>;

export const CertificateCreateBodySchema = z
  .object({
    clientEmployeeId: z.uuid(),
    lastCertifiedAt: dateString,
    nextRenewalAt: dateString,
    notes: optionalNotes,
    documentFileId: z.uuid().nullable().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.nextRenewalAt <= body.lastCertifiedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["nextRenewalAt"],
        message: "nextRenewalAt must be after lastCertifiedAt",
      });
    }
  });

export type CertificateCreateBody = z.infer<typeof CertificateCreateBodySchema>;

export const CertificateUpdateBodySchema = z
  .object({
    lastCertifiedAt: dateString.optional(),
    nextRenewalAt: dateString.optional(),
    notes: optionalNotes,
    documentFileId: z.uuid().nullable().optional(),
  })
  .superRefine((body, ctx) => {
    if (
      body.lastCertifiedAt !== undefined &&
      body.nextRenewalAt !== undefined &&
      body.nextRenewalAt <= body.lastCertifiedAt
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["nextRenewalAt"],
        message:
          "Корекция на дати — подновяването е нов ред, не промяна на този",
      });
    }
  });

export type CertificateUpdateBody = z.infer<typeof CertificateUpdateBodySchema>;

export const CertificateExpiringQuerySchema = PageQuerySchema.extend({
  days: z.coerce.number().int().min(0).max(365).default(30),
});

export type CertificateExpiringQuery = z.infer<
  typeof CertificateExpiringQuerySchema
>;

export const AgreementCreateBodySchema = z
  .object({
    clientId: z.uuid(),
    siteId: z.uuid(),
    serviceType: ServiceTypeSchema,
    signedAt: dateString,
    expiresAt: dateString,
    contractValue: moneyNonNegative,
    notes: optionalNotes,
  })
  .superRefine((body, ctx) => {
    if (body.expiresAt <= body.signedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expiresAt must be after signedAt",
      });
    }
  });

export type AgreementCreateBody = z.infer<typeof AgreementCreateBodySchema>;

export const AgreementUpdateBodySchema = z
  .object({
    signedAt: dateString.optional(),
    expiresAt: dateString.optional(),
    contractValue: moneyNonNegative.optional(),
    status: z
      .enum([
        AgreementStatus.ACTIVE,
        AgreementStatus.EXPIRED,
        AgreementStatus.TERMINATED,
      ])
      .optional(),
    notes: optionalNotes,
  })
  .superRefine((body, ctx) => {
    if (
      body.signedAt !== undefined &&
      body.expiresAt !== undefined &&
      body.expiresAt <= body.signedAt
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expiresAt must be after signedAt",
      });
    }
  });

export type AgreementUpdateBody = z.infer<typeof AgreementUpdateBodySchema>;

export const AgreementRenewBodySchema = z.object({
  previousId: z.uuid().optional(),
  newSignedAt: dateString,
  newExpiresAt: dateString.optional(),
});

export type AgreementRenewBody = z.infer<typeof AgreementRenewBodySchema>;

export const AgreementListQuerySchema = PageQuerySchema.extend({
  clientId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  status: AgreementStatusSchema.optional(),
  expiringWithin: z.coerce.number().int().min(0).max(365).optional(),
});

export type AgreementListQuery = z.infer<typeof AgreementListQuerySchema>;

export const AgreementExpiringQuerySchema = PageQuerySchema.extend({
  days: z.coerce.number().int().min(0).max(365).default(30),
});

export type AgreementExpiringQuery = z.infer<
  typeof AgreementExpiringQuerySchema
>;

export const FoodScheduleCreateBodySchema = z.object({
  siteId: z.uuid(),
  serviceType: ServiceTypeSchema,
  cadenceMonths: z.number().int().min(1).max(24),
  nextDueAt: dateString,
  notes: optionalNotes,
});

export type FoodScheduleCreateBody = z.infer<
  typeof FoodScheduleCreateBodySchema
>;

export const FoodScheduleUpdateBodySchema = z.object({
  cadenceMonths: z.number().int().min(1).max(24).optional(),
  nextDueAt: dateString.optional(),
  active: z.boolean().optional(),
  notes: optionalNotes,
});

export type FoodScheduleUpdateBody = z.infer<
  typeof FoodScheduleUpdateBodySchema
>;

export const FoodScheduleListQuerySchema = PageQuerySchema.extend({
  siteId: z.uuid().optional(),
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((v): boolean | undefined => {
      if (v === undefined) return undefined;
      return v === "true";
    }),
});

export type FoodScheduleListQuery = z.infer<typeof FoodScheduleListQuerySchema>;

export const FoodScheduleDueQuerySchema = PageQuerySchema.extend({
  asOf: dateString,
});

export type FoodScheduleDueQuery = z.infer<typeof FoodScheduleDueQuerySchema>;

export const FoodRecordCreateBodySchema = z
  .object({
    scheduleId: z.uuid().nullable().optional(),
    siteId: z.uuid(),
    collectedAt: dateString,
    sampleDescription: z.string().trim().min(2).max(2000),
    labName: optionalNotes,
    resultReceivedAt: dateString.nullable().optional(),
    resultStatus: FoodResultStatusSchema.optional(),
    resultSummary: optionalNotes,
    resultFileId: z.uuid().nullable().optional(),
    notes: optionalNotes,
  })
  .superRefine((body, ctx) => {
    const status = body.resultStatus ?? FoodResultStatus.PENDING;
    if (status === FoodResultStatus.PENDING) {
      if (body.resultReceivedAt != null) {
        ctx.addIssue({
          code: "custom",
          path: ["resultReceivedAt"],
          message: "resultReceivedAt must be null while PENDING",
        });
      }
    } else if (body.resultReceivedAt == null) {
      ctx.addIssue({
        code: "custom",
        path: ["resultReceivedAt"],
        message: "resultReceivedAt is required when result is set",
      });
    }
  });

export type FoodRecordCreateBody = z.infer<typeof FoodRecordCreateBodySchema>;

export const FoodRecordUpdateBodySchema = z
  .object({
    collectedAt: dateString.optional(),
    sampleDescription: z.string().trim().min(2).max(2000).optional(),
    labName: optionalNotes,
    resultReceivedAt: dateString.nullable().optional(),
    resultStatus: FoodResultStatusSchema.optional(),
    resultSummary: optionalNotes,
    resultFileId: z.uuid().nullable().optional(),
    notes: optionalNotes,
  })
  .superRefine((body, ctx) => {
    if (
      body.resultStatus !== undefined &&
      body.resultStatus !== FoodResultStatus.PENDING &&
      body.resultReceivedAt === null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["resultReceivedAt"],
        message: "resultReceivedAt is required when result is set",
      });
    }
  });

export type FoodRecordUpdateBody = z.infer<typeof FoodRecordUpdateBodySchema>;

export const FoodRecordListQuerySchema = PageQuerySchema.extend({
  siteId: z.uuid().optional(),
  scheduleId: z.uuid().optional(),
  resultStatus: FoodResultStatusSchema.optional(),
});

export type FoodRecordListQuery = z.infer<typeof FoodRecordListQuerySchema>;

export const EraseRequestBodySchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});

export type EraseRequestBody = z.infer<typeof EraseRequestBodySchema>;

export const CertifiedEmployeesQuerySchema = z.object({
  asOf: dateString.optional(),
});

export type CertifiedEmployeesQuery = z.infer<
  typeof CertifiedEmployeesQuerySchema
>;

// Response item schemas

export const HealthCertificateItemSchema = z.object({
  id: z.uuid(),
  clientEmployeeId: z.uuid(),
  lastCertifiedAt: dateString,
  nextRenewalAt: dateString,
  status: CertificateStatusSchema,
  notes: z.string().nullable(),
  documentFileId: z.uuid().nullable(),
  documentUrl: z.string().nullable().optional(),
  createdById: z.uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type HealthCertificateItem = z.infer<typeof HealthCertificateItemSchema>;

export const ClientEmployeeItemSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  clientName: z.string().optional(),
  fullName: z.string(),
  jobTitle: z.string().nullable(),
  siteId: z.uuid().nullable(),
  siteName: z.string().nullable().optional(),
  notes: z.string().nullable(),
  erasedAt: z.string().datetime().nullable(),
  certificateStatus: CertificateStatusSchema.nullable().optional(),
  nextRenewalAt: dateString.nullable().optional(),
  latestCertificate: HealthCertificateItemSchema.nullable().optional(),
  createdById: z.uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ClientEmployeeItem = z.infer<typeof ClientEmployeeItemSchema>;

export const ClientEmployeePageSchema = z.object({
  items: z.array(ClientEmployeeItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type ClientEmployeePage = z.infer<typeof ClientEmployeePageSchema>;

export const HealthCertificatePageSchema = z.object({
  items: z.array(HealthCertificateItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type HealthCertificatePage = z.infer<typeof HealthCertificatePageSchema>;

export const AgreementItemSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  clientName: z.string().optional(),
  siteId: z.uuid(),
  siteName: z.string().optional(),
  serviceType: ServiceTypeSchema,
  signedAt: dateString,
  expiresAt: dateString,
  contractValue: z.string(),
  status: AgreementStatusSchema,
  storedStatus: AgreementStatusSchema,
  previousAgreementId: z.uuid().nullable(),
  notes: z.string().nullable(),
  createdById: z.uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AgreementItem = z.infer<typeof AgreementItemSchema>;

export const AgreementPageSchema = z.object({
  items: z.array(AgreementItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type AgreementPage = z.infer<typeof AgreementPageSchema>;

export const FoodScheduleItemSchema = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  siteName: z.string().optional(),
  serviceType: ServiceTypeSchema,
  cadenceMonths: z.number().int(),
  nextDueAt: dateString,
  active: z.boolean(),
  notes: z.string().nullable(),
  createdById: z.uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type FoodScheduleItem = z.infer<typeof FoodScheduleItemSchema>;

export const FoodSchedulePageSchema = z.object({
  items: z.array(FoodScheduleItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type FoodSchedulePage = z.infer<typeof FoodSchedulePageSchema>;

export const FoodRecordItemSchema = z.object({
  id: z.uuid(),
  scheduleId: z.uuid().nullable(),
  siteId: z.uuid(),
  siteName: z.string().optional(),
  collectedAt: dateString,
  sampleDescription: z.string(),
  labName: z.string().nullable(),
  resultReceivedAt: dateString.nullable(),
  resultStatus: FoodResultStatusSchema,
  resultSummary: z.string().nullable(),
  resultFileId: z.uuid().nullable(),
  resultUrl: z.string().nullable().optional(),
  notes: z.string().nullable(),
  createdById: z.uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type FoodRecordItem = z.infer<typeof FoodRecordItemSchema>;

export const FoodRecordPageSchema = z.object({
  items: z.array(FoodRecordItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type FoodRecordPage = z.infer<typeof FoodRecordPageSchema>;

export const CertifiedEmployeeItemSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  jobTitle: z.string(),
  nextRenewalAt: dateString.nullable(),
  status: CertificateStatusSchema.nullable(),
});

export type CertifiedEmployeeItem = z.infer<typeof CertifiedEmployeeItemSchema>;

export const CertifiedEmployeesResponseSchema = z.object({
  items: z.array(CertifiedEmployeeItemSchema),
  counts: z.object({
    current: z.number().int().nonnegative(),
    expiring: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
  }),
});

export type CertifiedEmployeesResponse = z.infer<
  typeof CertifiedEmployeesResponseSchema
>;

export const ClientEmployeeExportSchema = z.object({
  employee: ClientEmployeeItemSchema,
  certificates: z.array(HealthCertificateItemSchema),
  exportedAt: z.string().datetime(),
});

export type ClientEmployeeExport = z.infer<typeof ClientEmployeeExportSchema>;

export const SiteCertificateCountsSchema = z.object({
  current: z.number().int().nonnegative(),
  expiring: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
});

export type SiteCertificateCounts = z.infer<typeof SiteCertificateCountsSchema>;

// Re-export enums used by consumers of this module
export { AgreementStatus, AgreementStatusSchema };
export { CertificateStatus, CertificateStatusSchema };
export { FoodResultStatus, FoodResultStatusSchema };
