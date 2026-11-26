import {
  CURRENCY,
  DocumentType,
  ErrorCode,
  InvoiceStatus,
  ServiceType,
  SiteStatus,
  assertCreditNoteLinesWithinOriginal,
  buildLineAmounts,
  createId,
  defineAbilityFor,
  formatInvoiceNumber,
  jobId,
  sumLines,
  type BatchCreateBody,
  type BatchCreateResult,
  type BatchIssueBody,
  type BatchIssueResult,
  type CreditNoteCreateBody,
  type DebitNoteCreateBody,
  type EmailEnqueueResult,
  type EmailEventList,
  type EmailSendBody,
  type InvoiceItem,
  type InvoiceLineInput,
} from "@ddcrm/shared";
import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable } from "@nestjs/common";
import { QUEUE_NAMES } from "@ddcrm/shared";
import type { Queue } from "bullmq";
import type { AuthRequestUser } from "../auth/auth.types";
import { isoDateToDate } from "../common/date-string";
import { AppException } from "../common/errors/app.exception";
import type { ServiceType as PrismaServiceType } from "../generated/prisma/client";
import {
  lockInvoiceCounterForUpdate,
  lockInvoiceForUpdate,
  readInvoiceCounterValue,
} from "../prisma/lock-invoice";
import { PrismaService } from "../prisma/prisma.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoicesService } from "./invoices.service";

export const INVOICE_EMAIL_JOB = "send-invoice-email";

export type InvoiceEmailJobData = {
  invoiceId: string;
  emailEventId: string;
  to: string;
  attempt: number;
};

const TREATMENT_LABELS: Record<PrismaServiceType, string> = {
  INSECT_CONTROL: "Дезинсекция",
  RODENT_CONTROL: "Дератизация",
  DISINFECTION: "Дезинфекция",
  OTHER: "Друго",
};

const DEFAULT_VAT_RATE = "20.00";

@Injectable()
export class InvoicesDocumentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(InvoicePdfService) private readonly invoicePdf: InvoicePdfService,
    @InjectQueue(QUEUE_NAMES.INVOICE_EMAIL)
    private readonly invoiceEmailQueue: Queue<InvoiceEmailJobData>,
  ) {}

  private abilityFor(user: AuthRequestUser) {
    return defineAbilityFor({
      id: user.id,
      role: user.role,
      areaIds: user.areaIds,
    });
  }

  private assertCan(
    user: AuthRequestUser,
    action: "read" | "issue" | "cancelViaCreditNote" | "sendEmail" | "batchCreate",
  ) {
    const ability = this.abilityFor(user);
    if (!ability.can(action, "Invoice")) {
      throw new AppException(ErrorCode.FORBIDDEN, "Forbidden");
    }
  }

  private lineCreateData(invoiceId: string, lines: InvoiceLineInput[]) {
    return lines.map((line, index) => {
      const amounts = buildLineAmounts(line);
      return {
        id: createId(),
        invoiceId,
        lineNo: index + 1,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        lineTotal: amounts.lineTotal,
        vatAmount: amounts.vatAmount,
      };
    });
  }

  private moneyFromLines(lines: InvoiceLineInput[]) {
    const totals = sumLines(
      lines.map((line) => ({
        amount: buildLineAmounts(line).lineTotal,
        vatRate: line.vatRate,
      })),
    );
    return totals;
  }

  private async nextNumber(tx: Parameters<Parameters<PrismaService["transaction"]>[0]>[0]) {
    const counter = await lockInvoiceCounterForUpdate(tx);
    const used = Number(counter.next_value);
    const number = formatInvoiceNumber(used);
    await tx.invoiceCounter.update({
      where: { id: "default" },
      data: { nextValue: used + 1 },
    });
    const nextValue = Number(await readInvoiceCounterValue(tx));
    if (nextValue !== used + 1) {
      throw new AppException(
        ErrorCode.INVOICE_NUMBER_COUNTER_CORRUPTED,
        "Invoice number counter corrupted",
      );
    }
    return number;
  }

  private async loadIssuedOriginal(id: string) {
    const original = await this.prisma.invoice.findUnique({
      where: { id },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    if (!original) {
      throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
    }
    return original;
  }

  async createCreditNote(
    user: AuthRequestUser,
    invoiceId: string,
    body: CreditNoteCreateBody,
  ): Promise<InvoiceItem> {
    this.assertCan(user, "cancelViaCreditNote");
    if (body.referencesInvoiceId !== invoiceId) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        "referencesInvoiceId must match path id",
      );
    }

    const original = await this.loadIssuedOriginal(invoiceId);
    if (original.documentType !== DocumentType.INVOICE) {
      throw new AppException(
        ErrorCode.CREDIT_NOTE_FOR_NON_ISSUED,
        "Credit note requires an issued invoice",
      );
    }

    const existing = await this.prisma.invoice.findFirst({
      where: {
        referencesInvoiceId: invoiceId,
        documentType: DocumentType.CREDIT_NOTE,
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppException(
        ErrorCode.CREDIT_NOTE_ALREADY_EXISTS,
        "Credit note already exists for this invoice",
      );
    }

    if (original.status !== InvoiceStatus.ISSUED) {
      throw new AppException(
        ErrorCode.CREDIT_NOTE_FOR_NON_ISSUED,
        "Credit note requires an issued invoice",
      );
    }

    try {
      assertCreditNoteLinesWithinOriginal(
        body.lines,
        original.lines.map((l) => ({
          lineTotal: Number(l.lineTotal).toFixed(2),
          vatRate: Number(l.vatRate).toFixed(2),
        })),
      );
    } catch (error) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        error instanceof Error ? error.message : "Invalid credit note lines",
      );
    }

    const totals = this.moneyFromLines(body.lines);
    const noteId = createId();

    try {
      await this.prisma.transaction(async (tx) => {
        const locked = await lockInvoiceForUpdate(tx, invoiceId);
        if (!locked || locked.status !== InvoiceStatus.ISSUED) {
          throw new AppException(
            ErrorCode.CREDIT_NOTE_FOR_NON_ISSUED,
            "Credit note requires an issued invoice",
          );
        }
        const number = await this.nextNumber(tx);
        await tx.invoice.create({
          data: {
            id: noteId,
            number,
            status: InvoiceStatus.ISSUED,
            documentType: DocumentType.CREDIT_NOTE,
            clientId: original.clientId,
            issuedAt: new Date(),
            issuedById: user.id,
            clientLegalName: original.clientLegalName,
            clientEik: original.clientEik,
            clientVatNumber: original.clientVatNumber,
            clientRegisteredAddress: original.clientRegisteredAddress,
            clientLegalRepresentative: original.clientLegalRepresentative,
            clientEmail: original.clientEmail,
            clientPhone: original.clientPhone,
            currency: original.currency,
            netAmount: totals.net,
            vatAmount: totals.vat,
            grossAmount: totals.gross,
            dueDate: original.dueDate,
            referencesInvoiceId: invoiceId,
            creditNoteReason: body.reason,
            createdById: user.id,
          },
        });
        await tx.invoiceLine.createMany({
          data: this.lineCreateData(noteId, body.lines),
        });
        // AFTER INSERT trigger sets original → CANCELLED_BY_CREDIT_NOTE
      });
    } catch (error) {
      if (error instanceof AppException) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (/invoices_one_credit_note|unique/i.test(msg)) {
        throw new AppException(
          ErrorCode.CREDIT_NOTE_ALREADY_EXISTS,
          "Credit note already exists for this invoice",
        );
      }
      throw error;
    }

    return this.invoices.findOne(user, noteId);
  }

  async createDebitNote(
    user: AuthRequestUser,
    invoiceId: string,
    body: DebitNoteCreateBody,
  ): Promise<InvoiceItem> {
    this.assertCan(user, "issue");
    if (body.referencesInvoiceId !== invoiceId) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        "referencesInvoiceId must match path id",
      );
    }

    const original = await this.loadIssuedOriginal(invoiceId);
    if (original.status !== InvoiceStatus.ISSUED || original.documentType !== DocumentType.INVOICE) {
      throw new AppException(
        ErrorCode.DEBIT_NOTE_FOR_NON_ISSUED,
        "Debit note requires an issued invoice",
      );
    }

    const totals = this.moneyFromLines(body.lines);
    const noteId = createId();

    await this.prisma.transaction(async (tx) => {
      const locked = await lockInvoiceForUpdate(tx, invoiceId);
      if (!locked || locked.status !== InvoiceStatus.ISSUED) {
        throw new AppException(
          ErrorCode.DEBIT_NOTE_FOR_NON_ISSUED,
          "Debit note requires an issued invoice",
        );
      }
      const number = await this.nextNumber(tx);
      await tx.invoice.create({
        data: {
          id: noteId,
          number,
          status: InvoiceStatus.ISSUED,
          documentType: DocumentType.DEBIT_NOTE,
          clientId: original.clientId,
          issuedAt: new Date(),
          issuedById: user.id,
          clientLegalName: original.clientLegalName,
          clientEik: original.clientEik,
          clientVatNumber: original.clientVatNumber,
          clientRegisteredAddress: original.clientRegisteredAddress,
          clientLegalRepresentative: original.clientLegalRepresentative,
          clientEmail: original.clientEmail,
          clientPhone: original.clientPhone,
          currency: original.currency,
          netAmount: totals.net,
          vatAmount: totals.vat,
          grossAmount: totals.gross,
          dueDate: original.dueDate,
          referencesInvoiceId: invoiceId,
          creditNoteReason: null,
          notes: body.reason ?? null,
          createdById: user.id,
        },
      });
      await tx.invoiceLine.createMany({
        data: this.lineCreateData(noteId, body.lines),
      });
    });

    return this.invoices.findOne(user, noteId);
  }

  async enqueueEmail(
    user: AuthRequestUser,
    invoiceId: string,
    body: EmailSendBody = {},
  ): Promise<EmailEnqueueResult> {
    this.assertCan(user, "sendEmail");

    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
    }
    if (
      invoice.status !== InvoiceStatus.ISSUED &&
      invoice.status !== InvoiceStatus.CANCELLED_BY_CREDIT_NOTE
    ) {
      throw new AppException(
        ErrorCode.INVOICE_ALREADY_ISSUED,
        "Email requires an issued invoice",
        { status: invoice.status },
      );
    }

    const to = (body.to?.trim() || invoice.clientEmail || "").trim();
    if (!to) {
      throw new AppException(
        ErrorCode.CLIENT_EMAIL_MISSING,
        "Client email missing on invoice snapshot",
      );
    }

    const attempt = 1;
    const deterministicJobId = jobId("invoice_email", invoiceId, attempt);
    const emailEventId = createId();

    try {
      await this.prisma.emailEvent.create({
        data: {
          id: emailEventId,
          invoiceId,
          toAddress: to,
          jobId: deterministicJobId,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/email_events_job_id|unique|P2002/i.test(msg)) {
        const existing = await this.prisma.emailEvent.findUnique({
          where: { jobId: deterministicJobId },
        });
        if (existing) {
          return { jobId: deterministicJobId };
        }
      }
      throw new AppException(ErrorCode.EMAIL_ENQUEUE_FAILED, "Failed to record email event");
    }

    try {
      await this.invoiceEmailQueue.add(
        INVOICE_EMAIL_JOB,
        { invoiceId, emailEventId, to, attempt },
        { jobId: deterministicJobId },
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // BullMQ rejects duplicate jobId — treat as idempotent success.
      if (/already exists|JobId|duplicat/i.test(msg)) {
        return { jobId: deterministicJobId };
      }
      throw new AppException(ErrorCode.EMAIL_ENQUEUE_FAILED, "Failed to enqueue email job");
    }

    return { jobId: deterministicJobId };
  }

  async listEmailEvents(user: AuthRequestUser, invoiceId: string): Promise<EmailEventList> {
    this.assertCan(user, "read");
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true },
    });
    if (!invoice) {
      throw new AppException(ErrorCode.INVOICE_NOT_FOUND, "Invoice not found");
    }
    const rows = await this.prisma.emailEvent.findMany({
      where: { invoiceId },
      orderBy: { createdAt: "desc" },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        invoiceId: row.invoiceId,
        notificationId: row.notificationId,
        kind: row.kind,
        toAddress: row.toAddress,
        sentAt: row.sentAt?.toISOString() ?? null,
        failedAt: row.failedAt?.toISOString() ?? null,
        error: row.error,
        jobId: row.jobId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async batchCreate(user: AuthRequestUser, body: BatchCreateBody): Promise<BatchCreateResult> {
    this.assertCan(user, "batchCreate");

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) {
      throw new AppException(ErrorCode.BATCH_MONTH_INVALID, "Invalid billing month");
    }

    const billingMonth = isoDateToDate(`${body.month}-01`);

    const sites = await this.prisma.site.findMany({
      where: {
        status: SiteStatus.ACTIVE,
        ...(body.areaId ? { areaId: body.areaId } : {}),
        subscriptions: {
          some: {
            startDate: { lte: billingMonth },
            OR: [{ endDate: null }, { endDate: { gte: billingMonth } }],
          },
        },
      },
      include: {
        subscriptions: {
          where: {
            startDate: { lte: billingMonth },
            OR: [{ endDate: null }, { endDate: { gte: billingMonth } }],
          },
          orderBy: { startDate: "desc" },
          take: 1,
        },
        client: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    const eligible = sites.filter((s) => s.subscriptions.length > 0);
    const existing = await this.prisma.invoice.findMany({
      where: {
        documentType: DocumentType.INVOICE,
        billingMonth,
        siteId: { in: eligible.map((s) => s.id) },
      },
      select: { siteId: true },
    });
    const already = new Set(existing.map((e) => e.siteId).filter(Boolean));

    const toCreate = eligible.filter((s) => !already.has(s.id));
    const skipped = eligible.length - toCreate.length;

    if (body.dryRun) {
      return {
        created: toCreate.length,
        skipped,
        siteIds: toCreate.map((s) => s.id),
      };
    }

    const createdIds: string[] = [];
    for (const site of toCreate) {
      const sub = site.subscriptions[0]!;
      const services = (sub.services as ServiceType[])
        .map((s) => TREATMENT_LABELS[s as PrismaServiceType] ?? s)
        .join(", ");
      const line: InvoiceLineInput = {
        description: `Абонамент ${body.month} — ${site.name}${services ? ` (${services})` : ""}`,
        quantity: "1.000",
        unitPrice: Number(sub.rate).toFixed(2),
        vatRate: DEFAULT_VAT_RATE,
      };
      const amounts = buildLineAmounts(line);
      const gross = (Number(amounts.lineTotal) + Number(amounts.vatAmount)).toFixed(2);
      const invoiceId = createId();

      try {
        await this.prisma.transaction(async (tx) => {
          await tx.invoice.create({
            data: {
              id: invoiceId,
              status: InvoiceStatus.DRAFT,
              documentType: DocumentType.INVOICE,
              clientId: site.clientId,
              currency: CURRENCY,
              netAmount: amounts.lineTotal,
              vatAmount: amounts.vatAmount,
              grossAmount: gross,
              billingMonth,
              siteId: site.id,
              createdById: user.id,
              notes: `Пакетно фактуриране ${body.month}`,
            },
          });
          await tx.invoiceLine.create({
            data: {
              id: createId(),
              invoiceId,
              lineNo: 1,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
              lineTotal: amounts.lineTotal,
              vatAmount: amounts.vatAmount,
            },
          });
        });
        createdIds.push(invoiceId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (/invoices_site_billing_month|unique|P2002/i.test(msg)) {
          // Concurrent create — count as skipped
          continue;
        }
        throw error;
      }
    }

    const createdSiteIds = (
      await this.prisma.invoice.findMany({
        where: { id: { in: createdIds } },
        select: { siteId: true },
      })
    )
      .map((r) => r.siteId)
      .filter((id): id is string => !!id);

    return {
      created: createdIds.length,
      skipped: eligible.length - createdIds.length,
      siteIds: createdSiteIds,
      createdIds,
    };
  }

  async batchIssue(user: AuthRequestUser, body: BatchIssueBody): Promise<BatchIssueResult> {
    this.assertCan(user, "issue");

    if (body.dryRun) {
      return {
        issued: body.invoiceIds,
        failed: [],
      };
    }

    const issued: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const id of body.invoiceIds) {
      try {
        await this.invoices.issue(user, id);
        issued.push(id);
      } catch (error) {
        const reason =
          error instanceof AppException
            ? error.body.code
            : error instanceof Error
              ? error.message
              : "UNKNOWN";
        failed.push({ id, reason });
      }
    }

    return { issued, failed };
  }

  /** Used by PDF route — ability check only. */
  assertCanReadPdf(user: AuthRequestUser) {
    this.assertCan(user, "read");
  }

  renderPdf(invoiceId: string, copy: boolean) {
    return this.invoicePdf.renderById(invoiceId, copy);
  }
}
