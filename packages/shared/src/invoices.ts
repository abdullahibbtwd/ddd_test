import { z } from "zod";
import { EmptyInvoiceError, computeLineTotal, computeVatAmount, sumLines } from "./money";
import { DocumentTypeSchema, InvoiceStatusSchema } from "./invoice-status";
import { PageQuerySchema } from "./page-query";

const optionalNotes = z
  .string()
  .trim()
  .max(4000)
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

/** Decimal string with up to `scale` fractional digits. */
function decimalString(scale: number, opts?: { minExclusive?: boolean; max?: number }) {
  return z
    .string()
    .regex(new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`), `Invalid decimal (max ${scale} dp)`)
    .superRefine((value, ctx) => {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: "custom", message: "Invalid number" });
        return;
      }
      if (opts?.minExclusive && !(n > 0)) {
        ctx.addIssue({ code: "custom", message: "Must be greater than 0" });
      }
      if (!opts?.minExclusive && n < 0) {
        ctx.addIssue({ code: "custom", message: "Must be >= 0" });
      }
      if (opts?.max !== undefined && n > opts.max) {
        ctx.addIssue({ code: "custom", message: `Must be <= ${opts.max}` });
      }
    });
}

export const InvoiceLineInputSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: decimalString(3, { minExclusive: true }),
  unitPrice: decimalString(2),
  vatRate: decimalString(2, { max: 100 }),
});

export type InvoiceLineInput = z.infer<typeof InvoiceLineInputSchema>;

export const InvoiceLineItemSchema = z.object({
  id: z.uuid(),
  lineNo: z.number().int().positive(),
  description: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  vatRate: z.string(),
  lineTotal: z.string(),
  vatAmount: z.string(),
});

export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;

export const InvoiceVisitSummarySchema = z.object({
  id: z.uuid(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  siteName: z.string(),
  treatmentType: z.string(),
  chargedAmount: z.string(),
});

export type InvoiceVisitSummary = z.infer<typeof InvoiceVisitSummarySchema>;

export const InvoiceClientSnapshotSchema = z.object({
  legalName: z.string(),
  eik: z.string(),
  vatNumber: z.string(),
  registeredAddress: z.string(),
  legalRepresentative: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export type InvoiceClientSnapshot = z.infer<typeof InvoiceClientSnapshotSchema>;

export const InvoiceClientLiveSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  eik: z.string().nullable(),
  vatNumber: z.string().nullable(),
  registeredAddress: z.string().nullable(),
  legalRepresentative: z.string().nullable(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export type InvoiceClientLive = z.infer<typeof InvoiceClientLiveSchema>;

export const InvoiceItemSchema = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  status: InvoiceStatusSchema,
  documentType: DocumentTypeSchema,
  clientId: z.uuid(),
  /** Live client fields while DRAFT; null once issued/cancelled (use snapshot). */
  client: InvoiceClientLiveSchema.nullable(),
  /** Snapshot copied at issue time; null while DRAFT. */
  snapshot: InvoiceClientSnapshotSchema.nullable(),
  currency: z.string(),
  netAmount: z.string(),
  vatAmount: z.string(),
  grossAmount: z.string(),
  notes: z.string().nullable(),
  issuedAt: z.string().datetime().nullable(),
  issuedBy: z.uuid().nullable(),
  issuedByName: z.string().nullable().optional(),
  createdBy: z.uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(InvoiceLineItemSchema),
  visits: z.array(InvoiceVisitSummarySchema),
  referencesInvoiceId: z.uuid().nullable().optional(),
  creditNoteReason: z.string().nullable().optional(),
  billingMonth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  siteId: z.uuid().nullable().optional(),
  emailSentAt: z.string().datetime().nullable().optional(),
  emailLastError: z.string().nullable().optional(),
  /** Set on issue (issued date + 30); null while DRAFT. */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  /** Present when this invoice was cancelled by a credit note. */
  creditNote: z
    .object({
      id: z.uuid(),
      number: z.string(),
      issuedAt: z.string().datetime(),
    })
    .nullable()
    .optional(),
});

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;

export const InvoiceListItemSchema = z.object({
  id: z.uuid(),
  number: z.string().nullable(),
  status: InvoiceStatusSchema,
  documentType: DocumentTypeSchema,
  clientId: z.uuid(),
  clientName: z.string(),
  currency: z.string(),
  grossAmount: z.string(),
  issuedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type InvoiceListItem = z.infer<typeof InvoiceListItemSchema>;

export const InvoiceListQuerySchema = PageQuerySchema.extend({
  status: InvoiceStatusSchema.optional(),
  clientId: z.uuid().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type InvoiceListQuery = z.infer<typeof InvoiceListQuerySchema>;

export const InvoicePageSchema = z.object({
  items: z.array(InvoiceListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type InvoicePage = z.infer<typeof InvoicePageSchema>;

export const CreateInvoiceBodySchema = z.object({
  clientId: z.uuid(),
  visitIds: z.array(z.uuid()).optional(),
  lines: z.array(InvoiceLineInputSchema).optional(),
  notes: optionalNotes,
});

export type CreateInvoiceBody = z.infer<typeof CreateInvoiceBodySchema>;

export const UpdateInvoiceDraftBodySchema = z
  .object({
    clientId: z.uuid().optional(),
    visitIds: z.array(z.uuid()).optional(),
    lines: z.array(InvoiceLineInputSchema).optional(),
    notes: optionalNotes,
  })
  .superRefine((body, ctx) => {
    if (
      body.clientId === undefined &&
      body.visitIds === undefined &&
      body.lines === undefined &&
      body.notes === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "At least one field is required",
      });
    }
  });

export type UpdateInvoiceDraftBody = z.infer<typeof UpdateInvoiceDraftBodySchema>;

/** Issue has an empty body. */
export const IssueInvoiceBodySchema = z.object({}).strict();

export type IssueInvoiceBody = z.infer<typeof IssueInvoiceBodySchema>;

const reasonRequired = z.string().trim().min(3).max(2000);
const reasonOptional = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

/** Credit note: references an issued invoice; reason required (≥ 3 chars). */
export const CreditNoteCreateBodySchema = z.object({
  referencesInvoiceId: z.uuid(),
  lines: z.array(InvoiceLineInputSchema).min(1),
  reason: reasonRequired,
});

export type CreditNoteCreateBody = z.infer<typeof CreditNoteCreateBodySchema>;

/** Debit note: references an issued invoice; reason optional. */
export const DebitNoteCreateBodySchema = z.object({
  referencesInvoiceId: z.uuid(),
  lines: z.array(InvoiceLineInputSchema).min(1),
  reason: reasonOptional,
});

export type DebitNoteCreateBody = z.infer<typeof DebitNoteCreateBodySchema>;

/** Email send is param-only (invoice id in path); optional override to-address. */
export const EmailSendBodySchema = z
  .object({
    to: z.string().trim().email().optional(),
  })
  .strict();

export type EmailSendBody = z.infer<typeof EmailSendBodySchema>;

export const BatchCreateBodySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"),
  areaId: z.uuid().optional(),
  dryRun: z.boolean().optional(),
});

export type BatchCreateBody = z.infer<typeof BatchCreateBodySchema>;

export const BatchCreateResultSchema = z.object({
  created: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  siteIds: z.array(z.uuid()),
  createdIds: z.array(z.uuid()).optional(),
});

export type BatchCreateResult = z.infer<typeof BatchCreateResultSchema>;

export const BatchIssueBodySchema = z.object({
  invoiceIds: z.array(z.uuid()).min(1),
  dryRun: z.boolean().optional(),
});

export type BatchIssueBody = z.infer<typeof BatchIssueBodySchema>;

export const BatchIssueResultSchema = z.object({
  issued: z.array(z.uuid()),
  failed: z.array(
    z.object({
      id: z.uuid(),
      reason: z.string(),
    }),
  ),
});

export type BatchIssueResult = z.infer<typeof BatchIssueResultSchema>;

export const EmailEnqueueResultSchema = z.object({
  jobId: z.string().min(1),
});

export type EmailEnqueueResult = z.infer<typeof EmailEnqueueResultSchema>;

export const EmailEventItemSchema = z.object({
  id: z.uuid(),
  invoiceId: z.uuid().nullable(),
  notificationId: z.uuid().nullable(),
  kind: z.enum(["INVOICE", "REMINDER", "NOTIFICATION"]).default("INVOICE"),
  toAddress: z.string(),
  sentAt: z.string().datetime().nullable(),
  failedAt: z.string().datetime().nullable(),
  error: z.string().nullable(),
  jobId: z.string(),
  createdAt: z.string().datetime(),
});

export type EmailEventItem = z.infer<typeof EmailEventItemSchema>;

export const EmailEventListSchema = z.object({
  items: z.array(EmailEventItemSchema),
});

export type EmailEventList = z.infer<typeof EmailEventListSchema>;

/**
 * Schema-level guard used by issue validation helpers / unit tests.
 * Draft create may be empty; issue-time emptiness is also checked in the API.
 */
export function assertInvoiceHasLines(lines: InvoiceLineInput[]): void {
  if (lines.length === 0) {
    throw new EmptyInvoiceError();
  }
}

/**
 * Credit-note line amounts must not exceed the corresponding original line
 * totals (by line index). Quantity × unitPrice (net) capped at original net.
 */
export function assertCreditNoteLinesWithinOriginal(
  creditLines: InvoiceLineInput[],
  originalLines: Array<{ lineTotal: string; vatRate: string }>,
): void {
  for (let i = 0; i < creditLines.length; i++) {
    const credit = creditLines[i]!;
    const original = originalLines[i];
    if (!original) {
      throw new Error(`Credit note line ${i + 1} has no matching original line`);
    }
    const creditNet = computeLineTotal(credit.quantity, credit.unitPrice);
    if (Number(creditNet) > Number(original.lineTotal)) {
      throw new Error(
        `Credit note line ${i + 1} net ${creditNet} exceeds original ${original.lineTotal}`,
      );
    }
  }
}

/** Compute persisted line money fields from input. */
export function buildLineAmounts(line: InvoiceLineInput): {
  lineTotal: string;
  vatAmount: string;
} {
  const lineTotal = computeLineTotal(line.quantity, line.unitPrice);
  const vatAmount = computeVatAmount(lineTotal, line.vatRate);
  return { lineTotal, vatAmount };
}

export { sumLines, EmptyInvoiceError };
