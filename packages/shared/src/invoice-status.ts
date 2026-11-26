import { z } from "zod";

export const InvoiceStatus = {
  DRAFT: "DRAFT",
  ISSUED: "ISSUED",
  CANCELLED_BY_CREDIT_NOTE: "CANCELLED_BY_CREDIT_NOTE",
} as const;

export const InvoiceStatusSchema = z.enum([
  InvoiceStatus.DRAFT,
  InvoiceStatus.ISSUED,
  InvoiceStatus.CANCELLED_BY_CREDIT_NOTE,
]);

export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const DocumentType = {
  INVOICE: "INVOICE",
  CREDIT_NOTE: "CREDIT_NOTE",
  DEBIT_NOTE: "DEBIT_NOTE",
} as const;

export const DocumentTypeSchema = z.enum([
  DocumentType.INVOICE,
  DocumentType.CREDIT_NOTE,
  DocumentType.DEBIT_NOTE,
]);

export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export type InvoiceStatusTransitionOpts = {
  /** True when a CREDIT_NOTE row referencing the invoice exists in the same tx. */
  hasCreditNoteInSameTx?: boolean;
};

/**
 * Shared model of allowed invoice status transitions.
 * The DB trigger remains the real guard; this mirrors it for unit tests / API pre-checks.
 *
 * Allowed:
 * - DRAFT → ISSUED
 * - ISSUED → CANCELLED_BY_CREDIT_NOTE only when hasCreditNoteInSameTx
 * Everything else is rejected.
 */
export function canTransitionInvoiceStatus(
  from: InvoiceStatus,
  to: InvoiceStatus,
  opts: InvoiceStatusTransitionOpts = {},
): boolean {
  if (from === to) return false;
  if (from === InvoiceStatus.DRAFT && to === InvoiceStatus.ISSUED) return true;
  if (
    from === InvoiceStatus.ISSUED &&
    to === InvoiceStatus.CANCELLED_BY_CREDIT_NOTE &&
    opts.hasCreditNoteInSameTx === true
  ) {
    return true;
  }
  return false;
}

export function assertInvoiceStatusTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
  opts: InvoiceStatusTransitionOpts = {},
): void {
  if (!canTransitionInvoiceStatus(from, to, opts)) {
    throw new Error(`Invalid invoice status transition: ${from} → ${to}`);
  }
}
