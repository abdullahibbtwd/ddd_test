import type {
  BatchCreateBody,
  BatchCreateResult,
  BatchIssueBody,
  BatchIssueResult,
  CreditNoteCreateBody,
  DebitNoteCreateBody,
  EmailEnqueueResult,
  EmailEventList,
  EmailSendBody,
  InvoiceItem,
} from "@ddcrm/shared";
import { apiFetch } from "./mutator";

type ApiResult<T> = { data: T; status: number; headers: Headers };

export function downloadInvoicePdfUrl(id: string, copy: boolean): string {
  const qs = copy ? "?copy=1" : "?copy=0";
  return `/api/invoices/${id}/pdf${qs}`;
}

export async function sendInvoiceEmail(id: string, body: EmailSendBody = {}) {
  return apiFetch<ApiResult<EmailEnqueueResult>>(`/api/invoices/${id}/email`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listInvoiceEmailEvents(id: string) {
  return apiFetch<ApiResult<EmailEventList>>(`/api/invoices/${id}/email-events`, {
    method: "GET",
  });
}

export async function createCreditNote(id: string, body: Omit<CreditNoteCreateBody, "referencesInvoiceId"> & { referencesInvoiceId?: string }) {
  return apiFetch<ApiResult<InvoiceItem>>(`/api/invoices/${id}/credit-note`, {
    method: "POST",
    body: JSON.stringify({ ...body, referencesInvoiceId: id }),
  });
}

export async function createDebitNote(id: string, body: Omit<DebitNoteCreateBody, "referencesInvoiceId"> & { referencesInvoiceId?: string }) {
  return apiFetch<ApiResult<InvoiceItem>>(`/api/invoices/${id}/debit-note`, {
    method: "POST",
    body: JSON.stringify({ ...body, referencesInvoiceId: id }),
  });
}

export async function batchCreateInvoices(body: BatchCreateBody) {
  return apiFetch<ApiResult<BatchCreateResult>>(`/api/invoices/batch`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function batchIssueInvoices(body: BatchIssueBody) {
  return apiFetch<ApiResult<BatchIssueResult>>(`/api/invoices/batch/issue`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
