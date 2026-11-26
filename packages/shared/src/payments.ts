import { z } from "zod";
import { addCalendarDays } from "./visit-windows";
import { InvoiceStatus, type InvoiceStatus as InvoiceStatusT } from "./invoice-status";
import { addMoney, compareMoney, roundHalfUp, subtractMoney } from "./money";
import { PageQuerySchema } from "./page-query";
import { PaymentMethod } from "./payment-method";

/** Payment methods allowed on payment rows (OTHER is clients-only). */
export const PaymentRecordMethod = {
  CASH: PaymentMethod.CASH,
  BANK_TRANSFER: PaymentMethod.BANK_TRANSFER,
  CARD: PaymentMethod.CARD,
} as const;

export const PaymentRecordMethodSchema = z.enum([
  PaymentRecordMethod.CASH,
  PaymentRecordMethod.BANK_TRANSFER,
  PaymentRecordMethod.CARD,
]);

export type PaymentRecordMethod = z.infer<typeof PaymentRecordMethodSchema>;

export const InvoicePaymentClassification = {
  DRAFT: "DRAFT",
  UNPAID_CURRENT: "UNPAID_CURRENT",
  OVERDUE: "OVERDUE",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;

export const InvoicePaymentClassificationSchema = z.enum([
  InvoicePaymentClassification.DRAFT,
  InvoicePaymentClassification.UNPAID_CURRENT,
  InvoicePaymentClassification.OVERDUE,
  InvoicePaymentClassification.PAID,
  InvoicePaymentClassification.CANCELLED,
]);

export type InvoicePaymentClassification = z.infer<
  typeof InvoicePaymentClassificationSchema
>;

export const AgingBucket = {
  "0_30": "0_30",
  "31_60": "31_60",
  "61_90": "61_90",
  "90_plus": "90_plus",
} as const;

export const AgingBucketSchema = z.enum([
  AgingBucket["0_30"],
  AgingBucket["31_60"],
  AgingBucket["61_90"],
  AgingBucket["90_plus"],
]);

export type AgingBucket = z.infer<typeof AgingBucketSchema>;

export const EmailEventKind = {
  INVOICE: "INVOICE",
  REMINDER: "REMINDER",
  NOTIFICATION: "NOTIFICATION",
} as const;

export const EmailEventKindSchema = z.enum([
  EmailEventKind.INVOICE,
  EmailEventKind.REMINDER,
  EmailEventKind.NOTIFICATION,
]);

export type EmailEventKind = z.infer<typeof EmailEventKindSchema>;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

const moneyPositive = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Invalid money amount")
  .superRefine((value, ctx) => {
    const n = Number(value);
    if (!Number.isFinite(n) || !(n > 0)) {
      ctx.addIssue({ code: "custom", message: "Amount must be greater than 0" });
    }
  });

const optionalNotes = z
  .string()
  .trim()
  .max(4000)
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

/**
 * Office payment create. CASH requires collectedByUserId (explicit for OFFICE);
 * non-CASH forbids it. Enforced here and again in the API for role defaults.
 */
export const PaymentCreateOfficeBodySchema = z
  .object({
    amount: moneyPositive,
    method: PaymentRecordMethodSchema,
    paidAt: dateString,
    collectedByUserId: z.uuid().optional().nullable(),
    notes: optionalNotes,
  })
  .superRefine((body, ctx) => {
    const hasCollector =
      body.collectedByUserId !== undefined && body.collectedByUserId !== null;
    if (body.method === PaymentRecordMethod.CASH && !hasCollector) {
      ctx.addIssue({
        code: "custom",
        path: ["collectedByUserId"],
        message: "collectedByUserId is required for CASH",
      });
    }
    if (body.method !== PaymentRecordMethod.CASH && hasCollector) {
      ctx.addIssue({
        code: "custom",
        path: ["collectedByUserId"],
        message: "collectedByUserId is forbidden for non-CASH methods",
      });
    }
  });

export type PaymentCreateOfficeBody = z.infer<typeof PaymentCreateOfficeBodySchema>;

/** FIELD visit payment — always CASH; collector is the actor. */
export const PaymentCreateFieldBodySchema = z.object({
  amount: moneyPositive,
  paidAt: dateString,
  notes: optionalNotes,
});

export type PaymentCreateFieldBody = z.infer<typeof PaymentCreateFieldBodySchema>;

export const HandoverCreateBodySchema = z.object({
  employeeId: z.uuid(),
  amount: moneyPositive,
  handedOverAt: dateString,
  receivedByUserId: z.uuid(),
  notes: optionalNotes,
});

export type HandoverCreateBody = z.infer<typeof HandoverCreateBodySchema>;

export const ReminderSendBodySchema = z.object({
  force: z.boolean().optional(),
});

export type ReminderSendBody = z.infer<typeof ReminderSendBodySchema>;

export const OutstandingQuerySchema = PageQuerySchema.extend({
  clientId: z.uuid().optional(),
  areaId: z.uuid().optional(),
  status: InvoicePaymentClassificationSchema.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  asOf: dateString.optional(),
});

export type OutstandingQuery = z.infer<typeof OutstandingQuerySchema>;

export const CashLedgerQuerySchema = z.object({
  employeeId: z.uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

export type CashLedgerQuery = z.infer<typeof CashLedgerQuerySchema>;

export const AgingQuerySchema = z.object({
  asOf: dateString.optional(),
  clientId: z.uuid().optional(),
  areaId: z.uuid().optional(),
});

export type AgingQuery = z.infer<typeof AgingQuerySchema>;

export const PaymentItemSchema = z.object({
  id: z.uuid(),
  invoiceId: z.uuid(),
  amount: z.string(),
  method: PaymentRecordMethodSchema,
  paidAt: dateString,
  collectedByUserId: z.uuid().nullable(),
  collectedByName: z.string().nullable().optional(),
  notes: z.string().nullable(),
  createdById: z.uuid(),
  createdAt: z.string().datetime(),
});

export type PaymentItem = z.infer<typeof PaymentItemSchema>;

export const PaymentListSchema = z.object({
  items: z.array(PaymentItemSchema),
  outstanding: z.string(),
  grossAmount: z.string(),
  paidSum: z.string(),
});

export type PaymentList = z.infer<typeof PaymentListSchema>;

export const HandoverItemSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  employeeName: z.string().optional(),
  amount: z.string(),
  handedOverAt: dateString,
  receivedByUserId: z.uuid(),
  receivedByName: z.string().optional(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdById: z.uuid(),
});

export type HandoverItem = z.infer<typeof HandoverItemSchema>;

export const HandoverCreateResultSchema = z.object({
  handover: HandoverItemSchema,
  outstanding: z.string(),
  collected: z.string(),
  handedOver: z.string(),
});

export type HandoverCreateResult = z.infer<typeof HandoverCreateResultSchema>;

export const OutstandingRowSchema = z.object({
  invoiceId: z.uuid(),
  number: z.string(),
  clientId: z.uuid(),
  clientName: z.string(),
  dueDate: dateString,
  grossAmount: z.string(),
  paidSum: z.string(),
  outstanding: z.string(),
  classification: InvoicePaymentClassificationSchema,
  agingBucket: AgingBucketSchema.nullable(),
});

export type OutstandingRow = z.infer<typeof OutstandingRowSchema>;

export const OutstandingPageSchema = z.object({
  items: z.array(OutstandingRowSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type OutstandingPage = z.infer<typeof OutstandingPageSchema>;

export const CashLedgerDaySchema = z.object({
  date: dateString,
  collected: z.string(),
  handedOver: z.string(),
});

export type CashLedgerDay = z.infer<typeof CashLedgerDaySchema>;

export const CashLedgerEmployeeSchema = z.object({
  employeeId: z.uuid(),
  employeeName: z.string(),
  collected: z.string(),
  handedOver: z.string(),
  outstanding: z.string(),
  days: z.array(CashLedgerDaySchema),
});

export type CashLedgerEmployee = z.infer<typeof CashLedgerEmployeeSchema>;

export const CashLedgerResponseSchema = z.object({
  employees: z.array(CashLedgerEmployeeSchema),
});

export type CashLedgerResponse = z.infer<typeof CashLedgerResponseSchema>;

/**
 * outstanding = gross − Σ payments. Uses decimal strings only (no floats).
 */
export function computeOutstanding(gross: string, payments: string[]): string {
  const g = roundHalfUp(gross, 2);
  let paid = "0.00";
  for (const p of payments) {
    paid = addMoney(paid, roundHalfUp(p, 2));
  }
  return subtractMoney(g, paid);
}

export type ClassifyInvoiceInput = {
  status: InvoiceStatusT;
  dueDate: string | null;
  outstanding: string;
  asOf: string;
};

/**
 * Computed payment classification. PAID is not an InvoiceStatus — it is
 * outstanding == 0 on an ISSUED invoice.
 */
export function classifyInvoice(
  input: ClassifyInvoiceInput,
): InvoicePaymentClassification {
  if (input.status === InvoiceStatus.DRAFT) {
    return InvoicePaymentClassification.DRAFT;
  }
  if (input.status === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE) {
    return InvoicePaymentClassification.CANCELLED;
  }
  // ISSUED
  if (compareMoney(input.outstanding, "0.00") === 0) {
    return InvoicePaymentClassification.PAID;
  }
  if (input.dueDate !== null && input.dueDate < input.asOf) {
    return InvoicePaymentClassification.OVERDUE;
  }
  return InvoicePaymentClassification.UNPAID_CURRENT;
}

/**
 * Days past due (asOf − dueDate) mapped to aging buckets.
 * Caller should only use this for overdue invoices.
 */
export function agingBuckets(dueDate: string, asOf: string): AgingBucket {
  let days = 0;
  let cursor = dueDate;
  while (cursor < asOf) {
    cursor = addCalendarDays(cursor, 1);
    days += 1;
    if (days > 10_000) break;
  }
  if (days <= 30) return AgingBucket["0_30"];
  if (days <= 60) return AgingBucket["31_60"];
  if (days <= 90) return AgingBucket["61_90"];
  return AgingBucket["90_plus"];
}

export type EmployeeCashInput = {
  payments: string[];
  handovers: string[];
};

export type EmployeeCashResult = {
  collected: string;
  handedOver: string;
  /** May be negative (over-handed). */
  outstanding: string;
};

export function computeEmployeeCash(input: EmployeeCashInput): EmployeeCashResult {
  let collected = "0.00";
  for (const p of input.payments) {
    collected = addMoney(collected, roundHalfUp(p, 2));
  }
  let handedOver = "0.00";
  for (const h of input.handovers) {
    handedOver = addMoney(handedOver, roundHalfUp(h, 2));
  }
  return {
    collected,
    handedOver,
    outstanding: subtractMoney(collected, handedOver),
  };
}

/** Default due date = issued calendar date (Sofia) + 30 days. */
export function defaultDueDateFromIssued(issuedDate: string): string {
  return addCalendarDays(issuedDate, 30);
}
